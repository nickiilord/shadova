import js from "@eslint/js"
import tseslint from "typescript-eslint"

export const config = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "**/eslint.config.ts",
      // 生成物（openapi-typescript 输出，永久 ignore——各前端应用通用）
      "apps/*/src/api/schema.d.ts",
      // shadcn CLI 管理的产物（ui 组件与随装 use-mobile hook 均为官方 registry 源码，禁止手写修改；
      // 官方产物与 strictTypeChecked 风格规则存在已知偏差，参照 schema.d.ts 生成物先例永久 ignore；
      // ignore 面精确等于 CLI 管理面——components/business/ 等手写代码将被正常 lint）
      "apps/*/src/components/ui/**",
      "apps/*/src/hooks/use-mobile.ts",
    ],
  },
  {
    files: ["e2e/**/*.ts"],
    rules: {
      // Playwright page-object helper 中内联框架类型可避免只为单个参数增加重复 import。
      "@typescript-eslint/consistent-type-imports": "off",
      // E2E 数据使用 Date.now() 生成跨场景唯一标识，数字模板是预期行为。
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
)

export default config
