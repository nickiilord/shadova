import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { hashPassword, prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import { createApp } from "../src/index.js"
import { loginAs, upsertMenu } from "./helpers.js"

const PASSWORD = "Passw0rd!"
const ADMIN_USERNAME = "portal_admin"
const VIEWER_USERNAME = "portal_viewer"
const NO_PERM_USERNAME = "portal_noperm"

/** 公开留言按来源 IP 限流：各用例使用独立 IP，避免跨用例互相触发 429 */
const ip = (address: string): Record<string, string> => ({ "x-forwarded-for": address })

/**
 * 建用户 + 角色 + 按权限码授权的 BUTTON 菜单。
 * 权限计算只取授权菜单的 permission 字段（含 BUTTON），因此测试无需建 MENU/DIR 层级。
 * 权限码一律取自 @repo/shared 注册表，注册表与种子漂移时测试先失败。
 */
async function createUserWithPermissions(username: string, roleCode: string, codes: string[]): Promise<void> {
  const user = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(PASSWORD), nickname: username },
  })
  const role = await prisma.role.create({ data: { nameZh: roleCode, code: roleCode } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
  const menus = await Promise.all(
    codes.map((code, index) => upsertMenu({ nameZh: code, type: "BUTTON", permission: code, sort: index + 1 })),
  )
  if (menus.length > 0) {
    await prisma.roleMenu.createMany({ data: menus.map((menu) => ({ roleId: role.id, menuId: menu.id })) })
  }
}

async function authHeaders(username: string): Promise<Record<string, string>> {
  const token = await loginAs(username, PASSWORD)
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

const PORTAL_CODES = Object.values(PERMISSIONS).filter((code) => code.startsWith("portal:"))
const VIEWER_CODES = [
  PERMISSIONS.portalSiteQuery,
  PERMISSIONS.portalSectionQuery,
  PERMISSIONS.portalBannerQuery,
  PERMISSIONS.portalMessageQuery,
]

describe("portal", () => {
  beforeAll(async () => {
    await createUserWithPermissions(ADMIN_USERNAME, "PORTAL_ADMIN", PORTAL_CODES)
    await createUserWithPermissions(VIEWER_USERNAME, "PORTAL_VIEWER", VIEWER_CODES)
    await createUserWithPermissions(NO_PERM_USERNAME, "PORTAL_NOPERM", [])
  })

  beforeEach(async () => {
    await prisma.portalSection.deleteMany()
    await prisma.portalBanner.deleteMany()
    await prisma.portalMessage.deleteMany()
    await prisma.portalConfig.deleteMany()
  })

  describe("公开首页（无需登录）", () => {
    it("聚合返回站点/区块/Banner：只含启用项且按 sort 升序", async () => {
      await prisma.portalConfig.create({ data: { siteName: "示例站点", siteTagline: "副标题" } })
      await prisma.portalSection.createMany({
        data: [
          { title: "后显示", sort: 2 },
          { title: "先显示", sort: 1 },
          { title: "已禁用", sort: 0, status: false },
        ],
      })
      await prisma.portalBanner.createMany({
        data: [
          { title: "启用图", imageUrl: "https://example.com/a.png", sort: 1 },
          { title: "禁用图", imageUrl: "https://example.com/b.png", sort: 2, status: false },
        ],
      })

      const res = await createApp().request("/api/portal/home")
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        code: number
        data: { site: { siteName: string; siteTagline: string | null }; sections: { title: string }[]; banners: { title: string }[] }
      }
      expect(body.code).toBe(0)
      expect(body.data.site.siteName).toBe("示例站点")
      expect(body.data.sections.map((section) => section.title)).toEqual(["先显示", "后显示"])
      expect(body.data.banners.map((banner) => banner.title)).toEqual(["启用图"])
    })

    it("尚未配置站点时返回空默认值而非报错", async () => {
      const res = await createApp().request("/api/portal/home")
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: { site: { siteName: string }; sections: unknown[]; banners: unknown[] } }
      expect(body.data.site.siteName).toBe("")
      expect(body.data.sections).toEqual([])
      expect(body.data.banners).toEqual([])
    })
  })

  describe("公开留言提交（无需登录）", () => {
    it("提交成功落库为待处理，返回回执", async () => {
      const res = await createApp().request("/api/portal/messages", {
        method: "POST",
        headers: { "content-type": "application/json", ...ip("203.0.113.10") },
        body: JSON.stringify({ name: "访客甲", contact: "a@example.com", content: "想了解合作方式" }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: { id: string; createdAt: string } }
      expect(body.data.id).toBeTruthy()

      const stored = await prisma.portalMessage.findUnique({ where: { id: body.data.id } })
      expect(stored?.status).toBe("PENDING")
      expect(stored?.handledAt).toBeNull()
      expect(stored?.content).toBe("想了解合作方式")
    })

    it("缺字段或超长返回 400 且不落库", async () => {
      const app = createApp()
      const invalid = [
        { contact: "a@example.com", content: "内容" },
        { name: "甲", content: "内容" },
        { name: "甲", contact: "a@example.com" },
        { name: "", contact: "a@example.com", content: "内容" },
        { name: "甲", contact: "a@example.com", content: "x".repeat(1001) },
      ]
      for (const [index, payload] of invalid.entries()) {
        const res = await app.request("/api/portal/messages", {
          method: "POST",
          headers: { "content-type": "application/json", ...ip(`203.0.113.${String(100 + index)}`) },
          body: JSON.stringify(payload),
        })
        expect(res.status).toBe(400)
      }
      expect(await prisma.portalMessage.count()).toBe(0)
    })

    it("同 IP 60 秒内第二条 429 且不落库", async () => {
      const app = createApp()
      const headers = { "content-type": "application/json", ...ip("203.0.113.20") }
      const payload = JSON.stringify({ name: "访客乙", contact: "b@example.com", content: "第一条" })

      const first = await app.request("/api/portal/messages", { method: "POST", headers, body: payload })
      expect(first.status).toBe(200)

      const second = await app.request("/api/portal/messages", { method: "POST", headers, body: payload })
      expect(second.status).toBe(429)
      expect(((await second.json()) as { code: string }).code).toBe("RATE_LIMITED")
      expect(await prisma.portalMessage.count()).toBe(1)
    })

    it("访客提交不计入操作日志（不是管理操作）", async () => {
      const app = createApp()
      await app.request("/api/portal/messages", {
        method: "POST",
        headers: { "content-type": "application/json", ...ip("203.0.113.30") },
        body: JSON.stringify({ name: "访客丙", contact: "c@example.com", content: "内容" }),
      })
      // 操作日志为 fire-and-forget，等待写入落地
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(await prisma.operationLog.count({ where: { path: "/api/portal/messages" } })).toBe(0)
    })
  })

  describe("站点配置管理", () => {
    it("读取未配置站点返回默认值；保存走单行 upsert 且未提交字段保持原值", async () => {
      const app = createApp()
      const auth = await authHeaders(ADMIN_USERNAME)

      const initial = await app.request("/api/portal/site", { headers: auth })
      expect(initial.status).toBe(200)
      expect(((await initial.json()) as { data: { siteName: string } }).data.siteName).toBe("")

      const save = await app.request("/api/portal/site", {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ siteName: "新站点", contactEmail: "hi@example.com" }),
      })
      expect(save.status).toBe(200)
      expect(((await save.json()) as { data: { siteName: string } }).data.siteName).toBe("新站点")

      const again = await app.request("/api/portal/site", {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ contactPhone: "010-12345678" }),
      })
      expect(again.status).toBe(200)
      expect(await prisma.portalConfig.count()).toBe(1)
      const row = await prisma.portalConfig.findFirst()
      expect(row?.siteName).toBe("新站点")
      expect(row?.contactEmail).toBe("hi@example.com")
      expect(row?.contactPhone).toBe("010-12345678")
    })

    it("并发保存不同字段互不覆盖：UPDATE 只含已提交字段", async () => {
      const app = createApp()
      const auth = await authHeaders(ADMIN_USERNAME)

      // 若实现写成「读当前值 → 合并 → 写回完整行」，后写者会拿自己读到的旧快照覆盖先写者的字段。
      // 只写已提交字段时，两个不相交的补丁无论执行顺序如何都不会互相覆盖（断言与时序无关）。
      const [first, second] = await Promise.all([
        app.request("/api/portal/site", {
          method: "PUT",
          headers: auth,
          body: JSON.stringify({ siteName: "并发站点" }),
        }),
        app.request("/api/portal/site", {
          method: "PUT",
          headers: auth,
          body: JSON.stringify({ contactEmail: "concurrent@example.com" }),
        }),
      ])
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)

      const saved = await prisma.portalConfig.findFirst()
      expect(saved?.siteName).toBe("并发站点")
      expect(saved?.contactEmail).toBe("concurrent@example.com")
    })
  })

  describe("图文区块与 Banner 管理", () => {
    it("区块：创建 / 分页 / 更新 / 删除；图标必须在白名单内", async () => {
      const app = createApp()
      const auth = await authHeaders(ADMIN_USERNAME)

      const created = await app.request("/api/portal/sections", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ title: "区块一", icon: "sparkles", description: "描述", sort: 1 }),
      })
      expect(created.status).toBe(200)
      const id = ((await created.json()) as { data: { id: string } }).data.id

      const badIcon = await app.request("/api/portal/sections", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ title: "区块二", icon: "not-a-real-icon" }),
      })
      expect(badIcon.status).toBe(400)

      const list = await app.request("/api/portal/sections?page=1&pageSize=10", { headers: auth })
      expect(list.status).toBe(200)
      expect(((await list.json()) as { data: { total: number } }).data.total).toBe(1)

      const patched = await app.request(`/api/portal/sections/${id}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ title: "区块改名", status: false }),
      })
      expect(patched.status).toBe(200)
      const patchedBody = (await patched.json()) as { data: { title: string; status: boolean } }
      expect(patchedBody.data.title).toBe("区块改名")
      expect(patchedBody.data.status).toBe(false)

      const removed = await app.request(`/api/portal/sections/${id}`, { method: "DELETE", headers: auth })
      expect(removed.status).toBe(200)
      expect(await prisma.portalSection.count()).toBe(0)
    })

    it("Banner：创建 / 更新 / 删除；不存在 id 返回 404", async () => {
      const app = createApp()
      const auth = await authHeaders(ADMIN_USERNAME)

      const created = await app.request("/api/portal/banners", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ title: "首页主图", imageUrl: "https://example.com/banner.png", linkUrl: "https://example.com" }),
      })
      expect(created.status).toBe(200)
      const id = ((await created.json()) as { data: { id: string } }).data.id

      const patched = await app.request(`/api/portal/banners/${id}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ sort: 9 }),
      })
      expect(patched.status).toBe(200)
      expect(((await patched.json()) as { data: { sort: number } }).data.sort).toBe(9)

      const missing = await app.request("/api/portal/banners/no_such_id", {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ sort: 1 }),
      })
      expect(missing.status).toBe(404)

      const removed = await app.request(`/api/portal/banners/${id}`, { method: "DELETE", headers: auth })
      expect(removed.status).toBe(200)
      expect(await prisma.portalBanner.count()).toBe(0)
    })
  })

  describe("留言反馈管理", () => {
    it("列表支持状态筛选；标记处理写入状态、备注与处理时间；删除生效", async () => {
      await prisma.portalMessage.createMany({
        data: [
          { name: "甲", contact: "a@example.com", content: "内容一" },
          { name: "乙", contact: "b@example.com", content: "内容二", status: "HANDLED", handledAt: new Date() },
        ],
      })
      const app = createApp()
      const auth = await authHeaders(ADMIN_USERNAME)

      const pending = await app.request("/api/portal/messages?page=1&pageSize=10&status=PENDING", { headers: auth })
      expect(pending.status).toBe(200)
      const pendingBody = (await pending.json()) as { data: { total: number; list: { id: string; name: string }[] } }
      expect(pendingBody.data.total).toBe(1)

      const target = pendingBody.data.list[0]
      expect(target).toBeDefined()
      const handled = await app.request(`/api/portal/messages/${String(target?.id)}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ status: "HANDLED", remark: "已电话回访" }),
      })
      expect(handled.status).toBe(200)

      const row = await prisma.portalMessage.findUnique({ where: { id: String(target?.id) } })
      expect(row?.status).toBe("HANDLED")
      expect(row?.remark).toBe("已电话回访")
      expect(row?.handledAt).not.toBeNull()

      const removed = await app.request(`/api/portal/messages/${String(target?.id)}`, { method: "DELETE", headers: auth })
      expect(removed.status).toBe(200)
      expect(await prisma.portalMessage.count()).toBe(1)
    })

    it("已处理的留言再次保存（仅补写备注）不刷新处理时间", async () => {
      const handledAt = new Date("2026-01-01T00:00:00.000Z")
      await prisma.portalMessage.create({
        data: { name: "丙", contact: "c@example.com", content: "内容", status: "HANDLED", handledAt },
      })
      const app = createApp()
      const auth = await authHeaders(ADMIN_USERNAME)
      const target = await prisma.portalMessage.findFirst()

      const res = await app.request(`/api/portal/messages/${String(target?.id)}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ status: "HANDLED", remark: "补写内部备注" }),
      })
      expect(res.status).toBe(200)

      const row = await prisma.portalMessage.findUnique({ where: { id: String(target?.id) } })
      expect(row?.remark).toBe("补写内部备注")
      // 状态未跃迁 → 处理时间必须保持原值（无条件 new Date() 会让此处失败）
      expect(row?.handledAt?.toISOString()).toBe(handledAt.toISOString())
    })
  })

  describe("权限边界", () => {
    it("管理接口：未登录 401；无权限 403 且不落库；只读用户可读不可写", async () => {
      const app = createApp()
      expect((await app.request("/api/portal/sections")).status).toBe(401)
      expect((await app.request("/api/portal/site")).status).toBe(401)
      expect((await app.request("/api/portal/messages")).status).toBe(401)

      const noperm = await authHeaders(NO_PERM_USERNAME)
      const list = await app.request("/api/portal/sections", { headers: noperm })
      expect(list.status).toBe(403)
      expect(((await list.json()) as { code: string }).code).toBe("PERMISSION_DENIED")

      const create = await app.request("/api/portal/sections", {
        method: "POST",
        headers: noperm,
        body: JSON.stringify({ title: "越权创建" }),
      })
      expect(create.status).toBe(403)
      const saveSite = await app.request("/api/portal/site", {
        method: "PUT",
        headers: noperm,
        body: JSON.stringify({ siteName: "越权站点" }),
      })
      expect(saveSite.status).toBe(403)
      expect(await prisma.portalSection.count()).toBe(0)
      expect(await prisma.portalConfig.count()).toBe(0)

      const viewer = await authHeaders(VIEWER_USERNAME)
      expect((await app.request("/api/portal/sections", { headers: viewer })).status).toBe(200)
      expect((await app.request("/api/portal/site", { headers: viewer })).status).toBe(200)
      const viewerCreate = await app.request("/api/portal/sections", {
        method: "POST",
        headers: viewer,
        body: JSON.stringify({ title: "只读越权" }),
      })
      expect(viewerCreate.status).toBe(403)
      expect(await prisma.portalSection.count()).toBe(0)
    })
  })
})
