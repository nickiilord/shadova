export default {
  "{apps,packages}/**/*.{ts,tsx}": ["eslint --fix"],
  // API 源码变更时重生成 OpenAPI 契约与前端类型（顺序：openapi 先于 types）。
  // 注意：lint-staged 只 re-add 已暂存且匹配任务 glob 的文件（gitWorkflow.applyModifications），
  // 生成物 openapi.json/schema.d.ts 不在此列 → 由 .husky/pre-commit 在 lint-staged 前显式 git add（防失同步）
  "apps/api/src/**/*.ts": [
    "pnpm --filter @repo/api generate:openapi",
    "pnpm --filter @repo/api generate:types",
    "pnpm --filter @repo/portal generate:types",
    "pnpm --filter @repo/mcp generate:types",
  ],
}
