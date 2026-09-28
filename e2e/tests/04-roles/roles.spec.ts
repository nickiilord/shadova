import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { RolesPage } from "../../pages/roles"

/** 按编码查角色 id（权限验证用例用） */
async function findRoleId(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  code: string,
): Promise<string> {
  const res = await request.get(`${API_BASE_URL}/api/roles?page=1&pageSize=100`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const body = (await res.json()) as { data: { list: { id: string; code: string }[] } }
  const role = body.data.list.find((item) => item.code === code)
  if (!role) throw new Error(`角色未找到: ${code}`)
  return role.id
}

/**
 * 角色管理类目：CRUD + 权限分配（菜单树勾选）。
 * 角色编码使用 E2E_ROLE_ 前缀（编码唯一约束）。
 */
test.describe("角色管理", () => {
  test("创建角色：填表提交后列表可见（编码自动大写）", async ({ adminPage }) => {
    const roles = new RolesPage(adminPage)
    await roles.goto()
    const code = "E2E_ROLE_CREATE"
    await roles.createRole({ nameZh: "创建测试角色", nameEn: "Create Test Role", code: "e2e_role_create" })
    await roles.searchAndExpect(code, true)
    await expect(adminPage.getByRole("row").filter({ hasText: code })).toContainText("创建测试角色")
  })

  test("删除角色：确认后从列表消失", async ({ adminPage, request }) => {
    const roles = new RolesPage(adminPage)
    await roles.goto()
    const code = "E2E_ROLE_DELETE"
    const nameZh = "删除测试角色"
    // API 前置创建
    const adminLogin = await request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    await request.post(`${API_BASE_URL}/api/roles`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { nameZh, nameEn: "Delete Test Role", code },
    })
    await roles.searchAndExpect(code, true)
    await roles.deleteRole(nameZh)
    await roles.searchAndExpect(code, false)
  })

  test("分配权限：勾选菜单树保存后权限生效（新角色用户可见该菜单）", async ({ adminPage, request }) => {
    const roles = new RolesPage(adminPage)
    await roles.goto()
    const code = "E2E_ROLE_GRANT"
    const nameZh = "权限测试角色"
    await roles.createRole({ nameZh, nameEn: "Grant Test Role", code })

    // 分配权限：勾选「数据字典」菜单（TreeCheckbox 的 Checkbox aria-label=节点名；勾选自动带全子项）
    const row = adminPage.getByRole("row").filter({ hasText: code })
    await row.getByRole("button", { name: "分配权限" }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByRole("checkbox", { name: "数据字典" }).click()
    // exact 必需：菜单授权树把权限节点也渲染为按钮（可访问名形如「保存站点配置 BUTTON」），
    // 非精确匹配会连同它们一起命中（strict mode violation）
    await dialog.getByRole("button", { name: "保存", exact: true }).click()
    await expect(dialog).toBeHidden()

    // 验证：新角色用户（API 创建）登录后 navTree 含数据字典，但无用户管理
    const adminLogin = await request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const userRes = await request.post(`${API_BASE_URL}/api/users`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { username: "e2e_u_granted", password: "Passw0rd!", nickname: "授权用户" },
    })
    const userBody = (await userRes.json()) as { data: { id: string } }
    const roleId = await findRoleId(request, adminBody.data.accessToken, code)
    await request.put(`${API_BASE_URL}/api/users/${userBody.data.id}/roles`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { roleIds: [roleId] },
    })

    const grantLogin = await request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "e2e_u_granted", password: "Passw0rd!" },
    })
    const grantBody = (await grantLogin.json()) as { data: { accessToken: string } }
    // navTree 在 /auth/me（登录响应只含 token + user）
    const meRes = await request.get(`${API_BASE_URL}/api/auth/me`, {
      headers: { authorization: `Bearer ${grantBody.data.accessToken}` },
    })
    const meBody = (await meRes.json()) as {
      data: { navTree: { nameZh: string; children: { nameZh: string }[] }[] }
    }
    const flat = meBody.data.navTree.flatMap((n) => [n.nameZh, ...n.children.map((c) => c.nameZh)])
    expect(flat).toContain("数据字典")
    expect(flat).not.toContain("用户管理")
  })
})
