import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"

/**
 * 门户管理（管理端侧）：侧边栏菜单可达性与站点配置页的保存流程。
 * 运行在 admin project（baseURL=5173）；门户侧的渲染断言由 portal-visitor.spec.ts 覆盖。
 */
test.describe("门户管理", () => {
  test("站点配置：改标语保存后回显，公开接口同步", async ({ adminPage, request }) => {
    const layout = new LayoutPage(adminPage)
    await layout.gotoMenu("门户管理", "站点配置", "/portal/site")

    const taglineInput = adminPage.getByLabel("站点标语")
    const original = await taglineInput.inputValue()
    const tagline = `E2E 标语 ${String(Date.now())}`

    await taglineInput.fill(tagline)
    await adminPage.getByRole("button", { name: "保存" }).click()
    // toast 会累积（本用例保存两次），取最新一条断言
    await expect(adminPage.getByText("站点配置已保存").first()).toBeVisible()

    // 公开接口（免登录）已同步同一份数据
    const home = (await (await request.get(`${API_BASE_URL}/api/portal/home`)).json()) as {
      data: { site: { siteTagline: string | null } }
    }
    expect(home.data.site.siteTagline).toBe(tagline)

    // 还原（共享 e2e 库）
    await taglineInput.fill(original)
    await adminPage.getByRole("button", { name: "保存" }).click()
    await expect(adminPage.getByText("站点配置已保存").first()).toBeVisible()
  })

  test("图文区块与留言反馈菜单可达，状态筛选显示文案而非原始值", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)

    await layout.gotoMenu("门户管理", "图文区块", "/portal/section")
    await expect(adminPage.getByRole("heading", { name: "图文区块" })).toBeVisible()

    await layout.gotoMenu("门户管理", "留言反馈", "/portal/message")
    await expect(adminPage.getByRole("heading", { name: "留言反馈" })).toBeVisible()

    // 回归：Base UI 的 Select.Value 不会自动提取 item label，必须显式映射 value→文案，
    // 否则触发器回退显示原始 value（此处曾显示哨兵值 "__all__"）
    const statusFilter = adminPage.getByRole("combobox").first()
    await expect(statusFilter).toContainText("全部")
    await expect(statusFilter).not.toContainText("__all__")
  })
})
