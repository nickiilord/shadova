-- ============================================================
-- Shadova 数据库结构文档（MySQL 方言）
-- 运行时权威为 packages/db/prisma/schema.prisma，本文件仅作开发速查
-- 改动 schema.prisma 时必须同步本文件（见 README.md）
-- ============================================================

-- 用户账号（统一认证主体：账号密码 / Clerk / 动态码三种登录方式共用）
CREATE TABLE `User` (
  `id`           VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `username`     VARCHAR(255) NOT NULL COMMENT '登录用户名（统一小写存储）',
  `passwordHash` VARCHAR(255) NOT NULL COMMENT '密码哈希（scrypt 算法；Clerk 用户可为空字符串）',
  `nickname`     VARCHAR(255) NOT NULL COMMENT '显示昵称',
  `email`        VARCHAR(255) NULL COMMENT '邮箱（可空，邮箱动态码登录用；统一小写存储）',
  `telephone`    VARCHAR(255) NULL COMMENT '手机号（可空）',
  `avatar`       VARCHAR(255) NULL COMMENT '头像文件名（上传到 /api/files，访问路径 /api/files/{avatar}）',
  `departmentId` VARCHAR(32)  NULL COMMENT '所属部门 ID（组织归属；不参与权限计算，null=未分配）',
  `clerkId`      VARCHAR(255) NULL COMMENT 'Clerk 用户 ID 映射（Clerk 登录时关联）',
  `status`       BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态（false=禁用）',
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt`    DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_username_key` (`username`),
  UNIQUE KEY `User_email_key` (`email`),
  UNIQUE KEY `User_telephone_key` (`telephone`),
  UNIQUE KEY `User_clerkId_key` (`clerkId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户账号（统一认证主体：账号密码 / Clerk / 动态码三种登录方式共用）';

-- 部门表（组织架构树；仅组织归属，不参与权限交集计算）
CREATE TABLE `Department` (
  `id`        VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `nameZh`    VARCHAR(255) NOT NULL COMMENT '中文名称（zh 界面展示）',
  `nameEn`    VARCHAR(255) NULL COMMENT '英文名称（en 界面展示，未填回落 nameZh）',
  `parentId`  VARCHAR(32)  NULL COMMENT '上级部门 ID（null=根部门）',
  `sort`      INT          NOT NULL DEFAULT 0 COMMENT '排序值（同层展示顺序）',
  `status`    BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态（false=禁用）',
  `createdAt` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt` DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  CONSTRAINT `Department_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Department` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表（组织架构树；仅组织归属，不参与权限交集计算）';

-- 角色（权限分组，通过 UserRole 关联用户、RoleMenu 关联菜单权限）
CREATE TABLE `Role` (
  `id`          VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `nameZh`      VARCHAR(255) NOT NULL COMMENT '中文名称（zh 语言展示）',
  `nameEn`      VARCHAR(255) NULL COMMENT '英文名称（en 语言展示，未填回落 nameZh）',
  `code`        VARCHAR(255) NOT NULL COMMENT '角色编码（如 ADMIN，程序判断用）',
  `description` VARCHAR(255) NULL COMMENT '角色描述',
  `sort`        INT          NOT NULL DEFAULT 0 COMMENT '排序值（列表展示顺序）',
  `status`      BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态（false=禁用）',
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt`   DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Role_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色（权限分组，通过 UserRole 关联用户、RoleMenu 关联菜单权限）';

-- 菜单/按钮权限（自关联树；类型约束见 parentId 注释）
CREATE TABLE `Menu` (
  `id`         VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `parentId`   VARCHAR(32)  NULL COMMENT '父节点 ID（null=根；类型约束: DIR→DIR/MENU, MENU→BUTTON, BUTTON→无子级）',
  `nameZh`     VARCHAR(255) NOT NULL COMMENT '中文名称（zh 语言展示）',
  `nameEn`     VARCHAR(255) NULL COMMENT '英文名称（en 语言展示，未填回落 nameZh）',
  `type`       VARCHAR(16)  NOT NULL COMMENT '类型（DIR 目录 / MENU 菜单 / BUTTON 按钮，字符串 + zod 校验，兼容三方言）',
  `path`       VARCHAR(255) NULL COMMENT '路由路径（MENU 必填，如 /system/user）',
  `component`  VARCHAR(255) NULL COMMENT '前端组件注册 key（MENU 必填）',
  `icon`       VARCHAR(64)  NULL COMMENT 'lucide 图标名（DIR/MENU 用）',
  `permission` VARCHAR(255) NULL COMMENT '权限码（MENU/BUTTON 用，如 system:user:add；DB 唯一索引强制，P2002 冲突转 409 + 应用层语义校验）',
  `sort`       INT          NOT NULL DEFAULT 0 COMMENT '同层排序值',
  `status`     BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态（false=禁用）',
  `createdAt`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt`  DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Menu_permission_key` (`permission`),
  KEY `Menu_parentId_fkey` (`parentId`),
  CONSTRAINT `Menu_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Menu` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='菜单/按钮权限（自关联树；类型约束见 parentId 注释）';

-- 用户-角色关联（联合主键防重复）
CREATE TABLE `UserRole` (
  `userId` VARCHAR(32) NOT NULL COMMENT '用户 ID',
  `roleId` VARCHAR(32) NOT NULL COMMENT '角色 ID',
  PRIMARY KEY (`userId`, `roleId`),
  CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联（联合主键防重复）';

-- 角色-菜单权限关联（含 BUTTON 节点）
CREATE TABLE `RoleMenu` (
  `roleId` VARCHAR(32) NOT NULL COMMENT '角色 ID',
  `menuId` VARCHAR(32) NOT NULL COMMENT '菜单 ID（含 BUTTON 节点）',
  PRIMARY KEY (`roleId`, `menuId`),
  CONSTRAINT `RoleMenu_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `RoleMenu_menuId_fkey` FOREIGN KEY (`menuId`) REFERENCES `Menu` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-菜单权限关联（含 BUTTON 节点）';

-- 刷新令牌（登录后签发，轮换时旧令牌吊销）
CREATE TABLE `RefreshToken` (
  `id`        VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `userId`    VARCHAR(32)  NOT NULL COMMENT '所属用户',
  `ip`        VARCHAR(64)  NULL COMMENT '来源 IP（登录/签发时记录，x-forwarded-for 首个地址 ?? x-real-ip，取不到存 null）',
  `userAgent` VARCHAR(512) NULL COMMENT '浏览器 UA（登录/签发时记录，取不到存 null）',
  `tokenHash` VARCHAR(64)  NOT NULL COMMENT '令牌哈希（sha256，不存明文）',
  `expiresAt` DATETIME    NOT NULL COMMENT '过期时间（签发后 7 天）',
  `revokedAt` DATETIME    NULL COMMENT '吊销时间（null=有效）',
  `createdAt` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `RefreshToken_tokenHash_key` (`tokenHash`),
  KEY `RefreshToken_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='刷新令牌（登录后签发，轮换时旧令牌吊销）';

-- 动态码（邮箱/手机号一次性验证码，OTP 登录用）
CREATE TABLE `OtpCode` (
  `id`           VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `channel`      VARCHAR(16)  NOT NULL COMMENT '渠道（EMAIL 邮箱 / TELEPHONE 手机号）',
  `target`       VARCHAR(255) NOT NULL COMMENT '目标地址（邮箱地址或手机号）',
  `codeHash`     VARCHAR(64)  NOT NULL COMMENT '验证码哈希（sha256，不存明文）',
  `expiresAt`    DATETIME     NOT NULL COMMENT '过期时间（5 分钟）',
  `attempts`     INT          NOT NULL DEFAULT 0 COMMENT '已尝试次数（上限 5 次）',
  `consumedAt`   DATETIME     NULL COMMENT '消费时间（null=未消费）',
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `userId`       VARCHAR(32)  NULL COMMENT '关联用户 ID（可空，未登录场景无关联）',
  PRIMARY KEY (`id`),
  KEY `idx_channel_target_created` (`channel`, `target`, `createdAt`),
  CONSTRAINT `OtpCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态码（邮箱/手机号一次性验证码，OTP 登录用）';

-- 登录日志表（登录成功/失败审计；失败也记录尝试的用户名——防枚举场景）
CREATE TABLE `LoginLog` (
  `id`        VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `username`  VARCHAR(255) NOT NULL COMMENT '登录账号（尝试的用户名，失败也记录——防枚举场景）',
  `userId`    VARCHAR(32)  NULL COMMENT '关联用户 ID（成功时有值；用户删除时置空保留历史）',
  `status`    VARCHAR(16)  NOT NULL COMMENT '结果（SUCCESS 成功 / FAILED 失败，字符串 + zod 校验）',
  `ip`        VARCHAR(64)  NULL COMMENT '来源 IP（x-forwarded-for 首个地址 ?? x-real-ip，取不到存 null）',
  `userAgent` VARCHAR(512) NULL COMMENT '浏览器 UA',
  `message`   VARCHAR(255) NULL COMMENT '失败原因（如 LOGIN_FAILED 错误码）',
  `createdAt` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `LoginLog_createdAt_idx` (`createdAt`),
  CONSTRAINT `LoginLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志表（登录成功/失败审计；失败也记录尝试的用户名——防枚举场景）';

-- 操作日志表（非 GET 写操作审计：操作人 / 接口 / 结果 / 耗时）
CREATE TABLE `OperationLog` (
  `id`           VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `userId`       VARCHAR(32)  NULL COMMENT '操作用户 ID（未登录操作记录 null）',
  `username`     VARCHAR(255) NULL COMMENT '操作账号（记录时从上下文取，null 表示未认证）',
  `method`       VARCHAR(16)  NOT NULL COMMENT 'HTTP 方法（POST/PATCH/PUT/DELETE 等）',
  `path`         VARCHAR(255) NOT NULL COMMENT '请求路径',
  `statusCode`   INT          NOT NULL COMMENT '响应状态码',
  `durationMs`   INT          NOT NULL COMMENT '处理耗时（毫秒）',
  `ip`           VARCHAR(64)  NULL COMMENT '来源 IP（x-forwarded-for 首个地址 ?? x-real-ip，取不到存 null）',
  `userAgent`    VARCHAR(512) NULL COMMENT '浏览器 UA',
  `errorMessage` VARCHAR(255) NULL COMMENT '非 2xx 时的响应 message（可选）',
  `requestBody`  TEXT         NULL COMMENT '请求体 JSON 快照（仅 application/json 写操作；180 字符截断；登录/OTP/改密等敏感路径不记录）',
  `createdAt`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `OperationLog_createdAt_idx` (`createdAt`),
  CONSTRAINT `OperationLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表（非 GET 写操作审计：操作人 / 接口 / 结果 / 耗时）';

-- 字典类型表（数据字典的类型定义，如 user_status；字典项见 DictItem）
CREATE TABLE `DictType` (
  `id`          VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `typeCode`    VARCHAR(255) NOT NULL COMMENT '类型编码（程序引用用，如 user_status）',
  `nameZh`      VARCHAR(255) NOT NULL COMMENT '类型中文名称',
  `nameEn`      VARCHAR(255) NULL COMMENT '类型英文名称（en 界面展示，未填回落 nameZh）',
  `description` VARCHAR(255) NULL COMMENT '类型描述',
  `status`      BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态（false=禁用）',
  `sort`        INT          NOT NULL DEFAULT 0 COMMENT '排序值（列表展示顺序）',
  `createdAt`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt`   DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `DictType_typeCode_key` (`typeCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典类型表（数据字典的类型定义，如 user_status；字典项见 DictItem）';

-- 字典项表（字典类型下的具体选项，如 user_status 的 enabled/disabled）
CREATE TABLE `DictItem` (
  `id`        VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `typeId`    VARCHAR(32)  NOT NULL COMMENT '所属字典类型 ID',
  `labelZh`   VARCHAR(255) NOT NULL COMMENT '项中文标签（界面展示）',
  `labelEn`   VARCHAR(255) NULL COMMENT '项英文标签（en 界面展示，未填回落 labelZh）',
  `value`     VARCHAR(255) NOT NULL COMMENT '项值（程序使用）',
  `sort`      INT          NOT NULL DEFAULT 0 COMMENT '排序值（列表展示顺序）',
  `status`    BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '启用状态（false=禁用，禁用的项 options 接口不返回）',
  `createdAt` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt` DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `DictItem_typeId_sort_idx` (`typeId`, `sort`),
  CONSTRAINT `DictItem_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `DictType` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典项表（字典类型下的具体选项，如 user_status 的 enabled/disabled）';

-- 系统参数表（key-value 配置，如 user.password.minLength；程序运行时读取）
CREATE TABLE `Config` (
  `id`          VARCHAR(32)   NOT NULL COMMENT '主键（cuid 全局唯一）',
  `configKey`   VARCHAR(255)  NOT NULL COMMENT '参数键（程序引用用，如 user.password.minLength）',
  `configValue` VARCHAR(1024) NOT NULL COMMENT '参数值',
  `nameZh`      VARCHAR(255)  NOT NULL COMMENT '参数中文名称',
  `nameEn`      VARCHAR(255)  NULL COMMENT '参数英文名称（en 界面展示，未填回落 nameZh）',
  `description` VARCHAR(255)  NULL COMMENT '参数说明',
  `status`      BOOLEAN       NOT NULL DEFAULT TRUE COMMENT '启用状态（false=禁用）',
  `createdAt`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt`   DATETIME      NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Config_configKey_key` (`configKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统参数表（key-value 配置，如 user.password.minLength；程序运行时读取）';

CREATE TABLE `Notification` (
  `id`        VARCHAR(32) NOT NULL COMMENT '主键（cuid 全局唯一）',
  `userId`    VARCHAR(32) NOT NULL COMMENT '接收用户 ID',
  `type`      VARCHAR(32) NOT NULL DEFAULT 'SYSTEM' COMMENT '通知类型（预留分类，当前统一 SYSTEM）',
  `title`     VARCHAR(64) NOT NULL COMMENT '通知标题',
  `content`   VARCHAR(500) NOT NULL COMMENT '通知内容',
  `isRead`    BOOLEAN     NOT NULL DEFAULT FALSE COMMENT '是否已读（false=未读，顶栏徽标计数）',
  `readAt`    DATETIME    NULL COMMENT '已读时间（标记已读时记录，未读为 null）',
  `createdAt` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `Notification_userId_isRead_createdAt_idx` (`userId`, `isRead`, `createdAt`),
  CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内通知表（系统/管理员发送，按接收用户隔离；发送方不落库，仅接收方可见）';

CREATE TABLE `Announcement` (
  `id`        VARCHAR(32)  NOT NULL COMMENT '主键（cuid 全局唯一）',
  `title`     VARCHAR(64)  NOT NULL COMMENT '公告标题',
  `content`   TEXT         NOT NULL COMMENT '公告内容（正文，可多行）',
  `status`    BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '发布状态（false=下架，下架后首页不再展示）',
  `createdAt` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（UTC）',
  `updatedAt` DATETIME     NOT NULL COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `Announcement_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告表（全局公告：管理员发布，登录用户首页横幅展示）';

-- 补充约束：User.departmentId 外键（Department 表定义在 User 之后，MySQL 下以 ALTER 形式后置；
-- 对应 schema.prisma User.department @relation(onDelete: SetNull)）
ALTER TABLE `User` ADD CONSTRAINT `User_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
