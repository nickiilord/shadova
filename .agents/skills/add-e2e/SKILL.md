---
name: add-e2e
description: Use when adding Playwright E2E coverage for a module in this RBAC admin (new spec for a new module, or fixing a failing spec in e2e/tests/), or when an e2e failure is caused by stale page objects / fixtures / module numbering.
---

# add-e2e：新增 E2E 测试

E2E 体系 = 编号目录（01-15 递增）+ page object（`e2e/pages/`）+ fixtures（每用例独立登录）+ 独立 e2e.db（global-setup 强制重建）。E2E 是模块级验收，前提是 api 集成测试已绿。

## 何时使用

- 新模块补 E2E（新 spec 目录）
- spec 失败排查（page object 过期、选择器失效、编号冲突）

## 前置假设

- 模块功能已通过 api 集成测试（e2e 不替代集成测试）
- 页面文案与交互已定（选择器依赖中文文案，fixtures 已注入 zh）

## 步骤清单

1. **编号目录**：`e2e/tests/<NN>-<module>/<module>.spec.ts`（NN 为现有最大编号 +1，如 16-api-keys）
2. **页面对象**（页面交互复杂时）：`e2e/pages/<module>.ts`，接收 Page，封装 goto/操作；简单用例可直接在 spec 用 getByRole/getByLabel（09-configs 先例）
3. **用例三模式**（参照既有 spec）：
   - 创建：填表提交 → 列表可见（断言业务效果，不断言 toast）
   - 删除：确认对话框 → 行消失
   - 特殊交互：授权/级联等（04-roles 先例）
4. **前置数据用 API 创建**：`request.post(API_BASE_URL + "/api/auth/login", { data: { username: "admin", password: "Admin@123" } })` 拿 token → 直接调业务 API 造数，再 reload 页面操作
5. **数据唯一化**：用例数据用 `Date.now()` 后缀（如 `e2e_config_${Date.now()}`）；角色编码统一 `E2E_` 前缀（编码唯一约束）
6. **本地验证单个 spec**：`cd e2e && pnpm exec playwright test tests/<NN>-<module>`（webServer 自起 api + web，e2e.db 由 global-setup 重建）

## 红线

- 禁止 storageState 复用登录态——**每用例独立登录**（refresh token 单活轮换，复用会因轮换竞态把后续 context 踢回登录页，见 e2e/fixtures.ts 注释）
- 禁止硬编码 API 地址（用 fixtures 导出的 `API_BASE_URL`）
- 禁止依赖种子数据之外的固定 id/顺序（列表分页可能影响定位——先搜索再操作）
- 禁止只跑 UI 不建前置数据（e2e 库每次 force-reset，用例必须自建数据）

## 范例索引

- 会话 fixture：`e2e/fixtures.ts`（adminPage 独立登录 + 竞态注释）
- 轻量 spec（无 page object）：`e2e/tests/09-configs/configs.spec.ts`
- 复杂 spec（page object + API 造数 + 授权验证）：`e2e/tests/04-roles/roles.spec.ts`
- page object：`e2e/pages/roles.ts`、`e2e/pages/layout.ts`（gotoMenu 导航）

## 易错点

- 中文文案断言依赖 zh 语言——fixtures 已注入，不要在 spec 里再改语言偏好。
- 多页数据时首屏定位会失败——先搜索（getByPlaceholder）再定位行。
- 删除确认按钮与行内删除按钮同名——用 `exact: true` 或 alertdialog 作用域区分（09-configs 先例）。
- e2e.db 不进 git（gitignore），本地跑完即重建，无需清理。
