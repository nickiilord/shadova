import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"
import { LayoutPage } from "./layout"

/** 用户管理页 Page Object（表单 label 基于 zh 文案） */
export class UsersPage {
  constructor(readonly page: Page) {}

  /** 打开用户管理页（侧边栏导航） */
  async goto(): Promise<void> {
    await new LayoutPage(this.page).gotoMenu("系统管理", "用户管理", "/system/user")
  }

  /** 打开新增用户弹窗并填表提交 */
  async createUser(input: {
    username: string
    password: string
    nickname: string
    email?: string
    telephone?: string
  }): Promise<void> {
    await this.page.getByRole("button", { name: "新增用户" }).click()
    const dialog = this.page.getByRole("dialog")
    await dialog.getByLabel("用户名").fill(input.username)
    await dialog.getByLabel("密码").fill(input.password)
    await dialog.getByLabel("昵称").fill(input.nickname)
    if (input.email) await dialog.getByLabel("邮箱").fill(input.email)
    if (input.telephone) await dialog.getByLabel("手机号").fill(input.telephone)
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
  }

  /** 按用户名搜索并断言出现 */
  async searchAndExpect(username: string, visible: boolean): Promise<void> {
    await this.page.getByPlaceholder(/搜索用户名/).fill(username)
    await this.page.getByRole("button", { name: "搜索" }).click()
    const row = this.page.getByRole("row").filter({ hasText: username })
    if (visible) {
      await expect(row).toBeVisible()
    } else {
      await expect(row).toHaveCount(0)
    }
  }

  /** 编辑用户昵称 */
  async editNickname(username: string, newNickname: string): Promise<void> {
    const row = this.page.getByRole("row").filter({ hasText: username })
    await row.getByRole("button", { name: "编辑" }).click()
    const dialog = this.page.getByRole("dialog")
    await dialog.getByLabel("昵称").fill(newNickname)
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
  }

  /** 禁用/启用用户（独立按钮 + AlertDialog 确认；按钮文案随当前状态切换，role 为 alertdialog） */
  async setStatus(username: string, enabled: boolean): Promise<void> {
    const row = this.page.getByRole("row").filter({ hasText: username })
    await row.getByRole("button", { name: enabled ? "启用" : "禁用" }).click()
    const dialog = this.page.getByRole("alertdialog")
    await dialog.getByRole("button", { name: enabled ? "启用" : "禁用", exact: true }).click()
    await expect(dialog).toBeHidden()
  }

  /** 删除用户（AlertDialog 确认；role 为 alertdialog 非 dialog） */
  async deleteUser(username: string): Promise<void> {
    const row = this.page.getByRole("row").filter({ hasText: username })
    await row.getByRole("button", { name: "删除" }).click()
    const dialog = this.page.getByRole("alertdialog")
    await dialog.getByRole("button", { name: "删除", exact: true }).click()
    await expect(dialog).toBeHidden()
  }

  /** 分配角色：打开弹窗勾选角色并保存 */
  async assignRoles(username: string, roleName: string): Promise<void> {
    const row = this.page.getByRole("row").filter({ hasText: username })
    await row.getByRole("button", { name: "分配角色" }).click()
    const dialog = this.page.getByRole("dialog")
    await dialog.getByText(roleName).click()
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden()
  }
}
