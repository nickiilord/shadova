import { expect } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"
import { LayoutPage } from "../../pages/layout"
import { LoginPage } from "../../pages/login"

/**
 * 个人资料类目：用户设置弹窗（修改昵称/邮箱/手机号 + 修改密码）。
 */
test.describe("个人资料", () => {
  test("用户设置：修改昵称后侧边栏同步更新", async ({ adminPage }) => {
    const layout = new LayoutPage(adminPage)
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /用户设置|User settings/i }).click()
    const dialog = adminPage.getByRole("dialog")
    const newNickname = `E2E 昵称 ${Date.now()}`
    await dialog.getByLabel("昵称").fill(newNickname)
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
    // 侧边栏用户区昵称更新（me 缓存失效重取）
    await expect(adminPage.getByText(newNickname).first()).toBeVisible()
    // 还原昵称（避免污染后续用例断言）
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /用户设置|User settings/i }).click()
    await dialog.getByLabel("昵称").fill("系统管理员")
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
  })

  test("修改密码：新密码登录成功，旧密码失效（一次性账号，不动 admin）", async ({ adminPage }) => {
    // 全局态解耦：改用 admin 会话经 API 创建一次性账号并对其改密，
    // admin 口令全程不变——用例中途失败也不会污染共享 e2e 库，避免后续用例雪崩
    const adminLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username: "admin", password: "Admin@123" },
    })
    const adminBody = (await adminLogin.json()) as { data: { accessToken: string } }
    const username = `e2e_pw_${Date.now()}`
    const oldPassword = "OldPass123!"
    const newPassword = "NewPassw0rd!"
    const createRes = await adminPage.request.post(`${API_BASE_URL}/api/users`, {
      headers: { authorization: `Bearer ${adminBody.data.accessToken}` },
      data: { username, password: oldPassword, nickname: "改密用例账号" },
    })
    expect(createRes.status()).toBe(200)

    // 登出 admin → 以一次性账号登录
    const layout = new LayoutPage(adminPage)
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /退出登录|Sign out/i }).click()
    await expect(adminPage).toHaveURL(/\/login/)
    const loginPage = new LoginPage(adminPage)
    await loginPage.login(username, oldPassword)
    await loginPage.expectLoggedIn()

    // 修改密码（独立弹窗入口：用户菜单 → 修改密码）
    await layout.openUserMenu()
    await adminPage.getByRole("menuitem", { name: /修改密码|Change password/i }).click()
    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("当前密码").fill(oldPassword)
    await dialog.getByLabel("新密码").fill(newPassword)
    await dialog.getByRole("button", { name: "保存" }).click()
    // 修改密码成功后吊销全部会话 → 主动登出回登录页
    await expect(adminPage).toHaveURL(/\/login/)

    // 新密码登录成功 / 旧密码失效
    const newLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username, password: newPassword },
    })
    expect(newLogin.status()).toBe(200)
    const oldLogin = await adminPage.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { username, password: oldPassword },
    })
    expect(oldLogin.status()).toBe(401)
  })
})
