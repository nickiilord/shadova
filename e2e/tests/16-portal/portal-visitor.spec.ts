import { expect } from "@playwright/test"
import type { APIRequestContext } from "@playwright/test"
import { API_BASE_URL, test } from "../../fixtures"

/**
 * 门户访客侧：公开首页（品牌区 / 图文区块 / SEO 标题）与公开留言提交。
 * 运行在 portal project（baseURL=5174）；管理端侧的准备与校验一律走 API（绝对地址），
 * 不跨 project 复用管理端 UI 会话。
 */

/** 管理端 API 登录（返回 Authorization 头） */
async function adminAuth(request: APIRequestContext): Promise<{ authorization: string }> {
  const login = await request.post(`${API_BASE_URL}/api/auth/login`, {
    data: { username: "admin", password: "Admin@123" },
  })
  if (login.status() !== 200) throw new Error(`API 登录失败: ${String(login.status())}`)
  const body = (await login.json()) as { data: { accessToken: string } }
  return { authorization: `Bearer ${body.data.accessToken}` }
}

test.describe("门户访客侧", () => {
  // 门户界面语言跟随浏览器（e2e 默认 en-US）；显式固定中文，断言与 seed 文案一致
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("language", "zh")
    })
  })

  test("未登录访客可见品牌区、图文区块与站点 SEO 标题", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Shadova" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "我们的优势" })).toBeVisible()
    await expect(page.getByText("安全可靠")).toBeVisible()
    await expect(page.getByText("模块化架构")).toBeVisible()
    // SEO 标题取自站点配置 seoTitle（React 19 将 <title> 提升到 head）
    await expect(page).toHaveTitle(/Shadova/)
  })

  test("管理端保存站点配置后，门户首页同步生效", async ({ page, request }) => {
    const auth = await adminAuth(request)
    const before = (await (
      await request.get(`${API_BASE_URL}/api/portal/site`, { headers: auth })
    ).json()) as { data: { siteTagline: string | null } }

    const tagline = `E2E 标语 ${String(Date.now())}`
    try {
      const save = await request.put(`${API_BASE_URL}/api/portal/site`, {
        headers: auth,
        data: { siteTagline: tagline },
      })
      expect(save.status()).toBe(200)

      await page.goto("/")
      await expect(page.getByText(tagline)).toBeVisible()
    } finally {
      // 共享 e2e 库：还原原值，避免污染其它用例
      await request.put(`${API_BASE_URL}/api/portal/site`, {
        headers: auth,
        data: { siteTagline: before.data.siteTagline },
      })
    }
  })

  test("访客提交留言：提示成功且落库为待处理", async ({ page, request }) => {
    const content = `E2E 留言 ${String(Date.now())}`
    await page.goto("/")
    await page.getByLabel("姓名").fill("E2E 访客")
    await page.getByLabel("联系方式").fill("e2e@example.com")
    await page.getByLabel("留言内容").fill(content)
    await page.getByRole("button", { name: "提交留言" }).click()
    await expect(page.getByText("留言已提交，我们会尽快与您联系")).toBeVisible()

    const auth = await adminAuth(request)
    const list = (await (
      await request.get(
        `${API_BASE_URL}/api/portal/messages?page=1&pageSize=10&keyword=${encodeURIComponent(content)}`,
        { headers: auth },
      )
    ).json()) as { data: { total: number; list: { id: string; status: string }[] } }
    expect(list.data.total).toBe(1)
    const created = list.data.list[0]
    expect(created?.status).toBe("PENDING")

    // 清理：删除该留言，保持共享 e2e 库干净
    if (created) {
      const removed = await request.delete(`${API_BASE_URL}/api/portal/messages/${created.id}`, {
        headers: auth,
      })
      expect(removed.status()).toBe(200)
    }
  })
})
