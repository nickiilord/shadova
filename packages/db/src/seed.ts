// 种子数据（幂等可重跑）：菜单树 / 角色授权 / admin 账号（设计文档 §9）
// upsert 策略：有 permission 的按 permission findUnique；无 permission 的按 nameZh+parentId+path findFirst；
// 存在则更新 nameEn（多语言展示字段，种子变更需同步存量行），其余字段不更新；不存在创建——重复运行不产生重复数据、不触发唯一约束冲突
import { pathToFileURL } from "node:url"
import { prisma } from "./client.js"
import { hashPassword } from "./lib/password.js"

interface MenuSeedInput {
  nameZh: string
  nameEn?: string
  type: string
  path?: string
  component?: string
  icon?: string
  permission?: string
  sort: number
  parentId?: string
}

async function upsertMenu(input: MenuSeedInput): Promise<string> {
  const existing = input.permission
    ? await prisma.menu.findUnique({ where: { permission: input.permission } })
    : await prisma.menu.findFirst({
        where: { nameZh: input.nameZh, parentId: input.parentId ?? null, path: input.path ?? null },
      })
  if (existing) {
    const updateData: { nameEn?: string; icon?: string | null } = {}
    if (input.nameEn !== undefined && existing.nameEn !== input.nameEn) updateData.nameEn = input.nameEn
    if (input.icon !== undefined && existing.icon !== input.icon) updateData.icon = input.icon
    if (Object.keys(updateData).length > 0) {
      await prisma.menu.update({ where: { id: existing.id }, data: updateData })
    }
    return existing.id
  }
  const created = await prisma.menu.create({
    data: {
      nameZh: input.nameZh,
      nameEn: input.nameEn ?? null,
      type: input.type,
      // exactOptionalPropertyTypes：可选参数 undefined 不可显式赋值，统一转 null
      path: input.path ?? null,
      component: input.component ?? null,
      icon: input.icon ?? null,
      permission: input.permission ?? null,
      sort: input.sort,
      parentId: input.parentId ?? null,
    },
  })
  return created.id
}

/** 部门幂等 upsert：按 nameZh+parentId 匹配（无唯一键），存在则同步 nameEn/sort，不重复创建 */
async function upsertDepartment(nameZh: string, nameEn: string, parentId: string | null, sort: number): Promise<string> {
  const existing = await prisma.department.findFirst({ where: { nameZh, parentId } })
  if (existing) {
    if (existing.nameEn !== nameEn || existing.sort !== sort) {
      await prisma.department.update({ where: { id: existing.id }, data: { nameEn, sort } })
    }
    return existing.id
  }
  const created = await prisma.department.create({ data: { nameZh, nameEn, parentId, sort } })
  return created.id
}

export async function runSeed(options: { resetAdminCredentials?: boolean } = {}): Promise<void> {
  try {
    // 1. 菜单树（与设计文档 §9 一致；nameEn 为英文展示名，en 语言时优先展示，未填回落 nameZh）
    const dashboardId = await upsertMenu({ nameZh: "概览", nameEn: "Dashboard", type: "MENU", path: "/", component: "dashboard", icon: "home", sort: 0 })
    // 系统管理无 permission/path 稳定键，按 nameZh+parentId 匹配：种子源码改名会静默新建（旧节点残留，需人工清理）；菜单管理页创建同名根节点会被误命中
    const sysId = await upsertMenu({ nameZh: "系统管理", nameEn: "System", type: "DIR", icon: "settings", sort: 100 })
    const userMenuId = await upsertMenu({
      nameZh: "用户管理", nameEn: "Users", type: "MENU", path: "/system/user", component: "system/user",
      icon: "users",
      permission: "system:user:query", sort: 1, parentId: sysId,
    })
    await upsertMenu({ nameZh: "用户新增", nameEn: "Add User", type: "BUTTON", permission: "system:user:create", sort: 1, parentId: userMenuId })
    await upsertMenu({ nameZh: "用户编辑", nameEn: "Edit User", type: "BUTTON", permission: "system:user:update", sort: 2, parentId: userMenuId })
    await upsertMenu({ nameZh: "用户删除", nameEn: "Delete User", type: "BUTTON", permission: "system:user:delete", sort: 3, parentId: userMenuId })
    await upsertMenu({ nameZh: "分配角色", nameEn: "Assign Roles", type: "BUTTON", permission: "system:user:assign-role", sort: 4, parentId: userMenuId })
    await upsertMenu({ nameZh: "重置密码", nameEn: "Reset Password", type: "BUTTON", permission: "system:user:reset-password", sort: 5, parentId: userMenuId })
    const roleMenuId = await upsertMenu({
      nameZh: "角色管理", nameEn: "Roles", type: "MENU", path: "/system/role", component: "system/role",
      icon: "user-cog",
      permission: "system:role:query", sort: 2, parentId: sysId,
    })
    await upsertMenu({ nameZh: "角色新增", nameEn: "Add Role", type: "BUTTON", permission: "system:role:create", sort: 1, parentId: roleMenuId })
    await upsertMenu({ nameZh: "角色编辑", nameEn: "Edit Role", type: "BUTTON", permission: "system:role:update", sort: 2, parentId: roleMenuId })
    await upsertMenu({ nameZh: "角色删除", nameEn: "Delete Role", type: "BUTTON", permission: "system:role:delete", sort: 3, parentId: roleMenuId })
    await upsertMenu({ nameZh: "分配权限", nameEn: "Grant Permissions", type: "BUTTON", permission: "system:role:assign", sort: 4, parentId: roleMenuId })
    const menuMenuId = await upsertMenu({
      nameZh: "菜单管理", nameEn: "Menus", type: "MENU", path: "/system/menu", component: "system/menu",
      icon: "menu",
      permission: "system:menu:query", sort: 3, parentId: sysId,
    })
    await upsertMenu({ nameZh: "菜单新增", nameEn: "Add Menu", type: "BUTTON", permission: "system:menu:create", sort: 1, parentId: menuMenuId })
    await upsertMenu({ nameZh: "菜单编辑", nameEn: "Edit Menu", type: "BUTTON", permission: "system:menu:update", sort: 2, parentId: menuMenuId })
    await upsertMenu({ nameZh: "菜单删除", nameEn: "Delete Menu", type: "BUTTON", permission: "system:menu:delete", sort: 3, parentId: menuMenuId })
    await upsertMenu({
      nameZh: "日志管理", nameEn: "Logs", type: "MENU", path: "/system/log", component: "system/log",
      icon: "server",
      permission: "system:log:query", sort: 4, parentId: sysId,
    })
    const sessionMenuId = await upsertMenu({
      nameZh: "会话管理", nameEn: "Sessions", type: "MENU", path: "/system/session", component: "system/session",
      icon: "network",
      permission: "system:session:query", sort: 5, parentId: sysId,
    })
    await upsertMenu({ nameZh: "强制下线", nameEn: "Force Sign-out", type: "BUTTON", permission: "system:session:revoke", sort: 1, parentId: sessionMenuId })
    const dictMenuId = await upsertMenu({
      nameZh: "数据字典", nameEn: "Dictionary", type: "MENU", path: "/system/dict", component: "system/dict",
      icon: "book-open",
      permission: "system:dict:query", sort: 6, parentId: sysId,
    })
    await upsertMenu({ nameZh: "字典新增", nameEn: "Add Dict Type", type: "BUTTON", permission: "system:dict:create", sort: 1, parentId: dictMenuId })
    await upsertMenu({ nameZh: "字典编辑", nameEn: "Edit Dict Type", type: "BUTTON", permission: "system:dict:update", sort: 2, parentId: dictMenuId })
    await upsertMenu({ nameZh: "字典删除", nameEn: "Delete Dict Type", type: "BUTTON", permission: "system:dict:delete", sort: 3, parentId: dictMenuId })
    const configMenuId = await upsertMenu({
      nameZh: "参数配置", nameEn: "Parameters", type: "MENU", path: "/system/config", component: "system/config",
      icon: "code",
      permission: "system:config:query", sort: 7, parentId: sysId,
    })
    await upsertMenu({ nameZh: "参数新增", nameEn: "Add Config", type: "BUTTON", permission: "system:config:create", sort: 1, parentId: configMenuId })
    await upsertMenu({ nameZh: "参数编辑", nameEn: "Edit Config", type: "BUTTON", permission: "system:config:update", sort: 2, parentId: configMenuId })
    await upsertMenu({ nameZh: "参数删除", nameEn: "Delete Config", type: "BUTTON", permission: "system:config:delete", sort: 3, parentId: configMenuId })
    // 通知中心为个人页面（查自己的通知，无查询权限码，同 Dashboard 先例）；发送通知按钮单独挂码
    const notificationMenuId = await upsertMenu({
      nameZh: "通知中心", nameEn: "Notifications", type: "MENU", path: "/system/notification", component: "system/notifications",
      icon: "bell",
      sort: 8, parentId: sysId,
    })
    await upsertMenu({ nameZh: "发送通知", nameEn: "Send Notification", type: "BUTTON", permission: "system:notification:create", sort: 1, parentId: notificationMenuId })
    const deptMenuId = await upsertMenu({
      nameZh: "部门管理", nameEn: "Departments", type: "MENU", path: "/system/department", component: "system/department",
      icon: "cloud",
      permission: "system:dept:query", sort: 9, parentId: sysId,
    })
    await upsertMenu({ nameZh: "部门新增", nameEn: "Add Department", type: "BUTTON", permission: "system:dept:create", sort: 1, parentId: deptMenuId })
    await upsertMenu({ nameZh: "部门编辑", nameEn: "Edit Department", type: "BUTTON", permission: "system:dept:update", sort: 2, parentId: deptMenuId })
    await upsertMenu({ nameZh: "部门删除", nameEn: "Delete Department", type: "BUTTON", permission: "system:dept:delete", sort: 3, parentId: deptMenuId })
    const announcementMenuId = await upsertMenu({
      nameZh: "公告管理", nameEn: "Announcements", type: "MENU", path: "/system/announcement", component: "system/announcement",
      icon: "message-square",
      permission: "system:announcement:query", sort: 10, parentId: sysId,
    })
    await upsertMenu({ nameZh: "公告新增", nameEn: "Add Announcement", type: "BUTTON", permission: "system:announcement:create", sort: 1, parentId: announcementMenuId })
    await upsertMenu({ nameZh: "公告编辑", nameEn: "Edit Announcement", type: "BUTTON", permission: "system:announcement:update", sort: 2, parentId: announcementMenuId })
    await upsertMenu({ nameZh: "公告删除", nameEn: "Delete Announcement", type: "BUTTON", permission: "system:announcement:delete", sort: 3, parentId: announcementMenuId })

    // 2. 角色：ADMIN 授权全量菜单+按钮；GUEST 仅 Dashboard（deleteMany + createMany 全量覆盖，幂等）
    const allMenuIds = (await prisma.menu.findMany({ select: { id: true } })).map((m) => m.id)
    const adminRole = await prisma.role.upsert({
      where: { code: "ADMIN" },
      update: { nameZh: "管理员", nameEn: "Administrator" },
      create: { nameZh: "管理员", nameEn: "Administrator", code: "ADMIN", sort: 0 },
    })
    await prisma.$transaction([
      prisma.roleMenu.deleteMany({ where: { roleId: adminRole.id } }),
      prisma.roleMenu.createMany({ data: allMenuIds.map((menuId) => ({ roleId: adminRole.id, menuId })) }),
    ])
    const guestRole = await prisma.role.upsert({
      where: { code: "GUEST" },
      update: { nameZh: "访客", nameEn: "Guest" },
      create: { nameZh: "访客", nameEn: "Guest", code: "GUEST", sort: 100 },
    })
    await prisma.$transaction([
      prisma.roleMenu.deleteMany({ where: { roleId: guestRole.id } }),
      prisma.roleMenu.createMany({ data: [{ roleId: guestRole.id, menuId: dashboardId }] }),
    ])

    // 3. 用户：admin / Admin@123（挂 ADMIN）。
    // 安全默认：不重置已有 admin 的口令与联系信息（防生产库误跑 seed 回滚凭据）；
    // 显式传入 resetAdminCredentials（CLI 为 --reset-admin）时才恢复演示凭据
    const adminPasswordHash = await hashPassword("Admin@123")
    const resetAdmin = options.resetAdminCredentials === true
    const adminUser = await prisma.user.upsert({
      where: { username: "admin" },
      update: resetAdmin
        ? {
            passwordHash: adminPasswordHash,
            nickname: "系统管理员",
            email: "admin@example.com",
            telephone: "13800138000",
          }
        : {},
      create: {
        username: "admin",
        passwordHash: adminPasswordHash,
        nickname: "系统管理员",
        email: "admin@example.com",
        telephone: "13800138000",
      },
    })
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: adminUser.id } }),
      prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } }),
    ])

    // 4. 演示数据：字典类型 user_status + 系统参数 user.password.minLength
    // 字典类型按 typeCode 幂等 upsert；字典项全量替换（deleteMany + createMany），重复运行不产生重复项
    const userStatusType = await prisma.dictType.upsert({
      where: { typeCode: "user_status" },
      update: { nameZh: "用户状态", nameEn: "User Status", description: "用户账号状态字典（示例数据，供演示数据字典用法）", sort: 0 },
      create: { typeCode: "user_status", nameZh: "用户状态", nameEn: "User Status", description: "用户账号状态字典（示例数据，供演示数据字典用法）", sort: 0 },
    })
    await prisma.$transaction([
      prisma.dictItem.deleteMany({ where: { typeId: userStatusType.id } }),
      prisma.dictItem.createMany({
        data: [
          { typeId: userStatusType.id, labelZh: "启用", labelEn: "Enabled", value: "enabled", sort: 1 },
          { typeId: userStatusType.id, labelZh: "禁用", labelEn: "Disabled", value: "disabled", sort: 2 },
        ],
      }),
    ])
    await prisma.config.upsert({
      where: { configKey: "user.password.minLength" },
      update: { configValue: "8", nameZh: "密码最小长度", nameEn: "Min Password Length", description: "登录/修改密码时密码的最小长度（示例数据，供演示参数配置用法）" },
      create: { configKey: "user.password.minLength", configValue: "8", nameZh: "密码最小长度", nameEn: "Min Password Length", description: "登录/修改密码时密码的最小长度（示例数据，供演示参数配置用法）" },
    })
    await prisma.config.upsert({
      where: { configKey: "user.password.resetDefault" },
      update: {},
      create: { configKey: "user.password.resetDefault", configValue: "Admin@123", nameZh: "用户重置密码默认值", nameEn: "User Reset Password Default", description: "管理员重置用户密码时使用的默认密码" },
    })

    // 3.1 演示部门树：按 nameZh+parentId 幂等 upsert（无唯一键，匹配名称与上级）；admin 挂根部门
    const hqDept = await upsertDepartment("总部", "Headquarters", null, 1)
    await upsertDepartment("技术部", "Engineering", hqDept, 1)
    await upsertDepartment("市场部", "Marketing", hqDept, 2)
    await upsertDepartment("财务部", "Finance", hqDept, 3)
    if (adminUser.departmentId === null) {
      await prisma.user.update({ where: { id: adminUser.id }, data: { departmentId: hqDept } })
    }

    // 4.0 演示公告：仅表空时插入（公告是运营数据，重复 seed 不得覆盖人工编辑的内容）
    if ((await prisma.announcement.count()) === 0) {
      await prisma.announcement.create({
        data: {
          title: "平台上线公告",
          content: "欢迎使用本管理平台（示例公告，可在「系统管理 → 公告管理」中维护，首页顶部横幅展示）",
        },
      })
    }

    // 4.1 演示通知：仅表空时插入（通知是用户数据，重复 seed 不得覆盖已读状态；已存在则不追加）
    if ((await prisma.notification.count()) === 0) {
      await prisma.notification.createMany({
        data: [
          { userId: adminUser.id, title: "欢迎使用", content: "欢迎使用本平台（示例通知，可在通知中心标记已读）" },
          { userId: adminUser.id, title: "系统维护提醒", content: "系统将于每周日凌晨 02:00-03:00 进行例行维护，期间服务可能短暂不可用（示例通知）" },
        ],
      })
    }

    // 5. 摘要
    const menuCount = await prisma.menu.count()
    const roleCount = await prisma.role.count()
    const userCount = await prisma.user.count()
    const dictTypeCount = await prisma.dictType.count()
    const configCount = await prisma.config.count()
    const notificationCount = await prisma.notification.count()
    const announcementCount = await prisma.announcement.count()
    console.log(`seed done: 菜单 ${String(menuCount)} 条 / 角色 ${String(roleCount)} 个 / 用户 ${String(userCount)} 个 / 字典类型 ${String(dictTypeCount)} 个 / 参数 ${String(configCount)} 个 / 通知 ${String(notificationCount)} 条 / 公告 ${String(announcementCount)} 条`)
    console.log("默认账号: admin / Admin@123（角色 ADMIN，已授权全部菜单）")
  } finally {
    await prisma.$disconnect()
  }
}

// 仅直接运行时执行种子（tsx src/seed.ts [--reset-admin]）；容器首启经 init.ts 条件调用（User 表空才 seed）。
// --reset-admin：恢复 admin 演示口令与联系方式（默认不重置，防误跑回滚凭据）
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  runSeed({ resetAdminCredentials: process.argv.includes("--reset-admin") }).catch((err: unknown) => {
    const message = err instanceof Error ? err.stack ?? err.message : String(err)
    console.error("[seed] 失败:", message)
    process.exit(1)
  })
}
