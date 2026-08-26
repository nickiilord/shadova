<div align="center">
  <h1>shadcn-mono</h1>
  <p><strong>契約駆動でテスト可能な、フルスタック RBAC 管理画面モノレポ。</strong></p>
  <p><a href="./README.md">简体中文</a> · <a href="./README.en.md">English</a> · 日本語</p>
</div>

`shadcn-mono` は、React 管理画面、Hono API、Prisma データ層、共有 RBAC ルールを 1 つの Turborepo にまとめたプロジェクトです。ローカル JWT、メール/SMS ワンタイムコード、Clerk 認証に対応し、同じ Zod/OpenAPI 契約から API ドキュメントとフロントエンド型を生成します。

> [!IMPORTANT]
> `admin / Admin@123` はローカルデモ専用です。デプロイ前に既定の認証情報を変更し、本番用シークレットと実際のメール/SMS 配信サービスを設定してください。

## 設計方針

- **契約優先**：実行時検証、OpenAPI、フロントエンド型を同じ route schema から生成します。
- **認可の一元化**：複数ロールの厳密な積集合を `packages/shared` に置き、Web と API で共有します。
- **移植可能なデータ層**：Prisma で SQLite、MySQL、PostgreSQL に対応します。
- **安全なデフォルト**：本番 JWT を検証し、OTP はハッシュのみ保存し、本番 Sender 未設定時は fail-closed になります。
- **検証可能な変更**：GitHub Actions、Vitest、Testing Library、ESLint、Husky、commitlint を品質ゲートとして使います。

## クイックスタート

### 必要環境

- Node.js 22 以降
- pnpm 9.x（リポジトリでは `pnpm@9.12.0` を固定）

### ローカル実行

```bash
git clone https://github.com/Nicki518412/shadcn-mono.git
cd shadcn-mono

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env

pnpm install
pnpm --filter @repo/db db:push
pnpm --filter @repo/db seed
pnpm dev
```

<http://localhost:5173> を開いてください。API は <http://localhost:3001>、Swagger UI は <http://localhost:3001/api/docs> で利用できます。

デモ認証情報：`admin / Admin@123`。seed は冪等に再実行でき、このアカウントのパスワードとデモ用連絡先をリセットします。

## 機能

- **管理画面**：React 19、Vite、React Router、TanStack Query、Tailwind CSS、shadcn/ui。
- **API**：Hono、Zod、`@hono/zod-openapi`、Swagger UI。
- **認証**：ユーザー名/パスワード、メール/SMS ワンタイムコード、Clerk。
- **認可**：メニュー、動的ルート、ページ操作で共有する複数ロールの厳密な積集合。
- **データ層**：SQLite / MySQL / PostgreSQL 対応の Prisma。
- **テスト**：API integration、Web RTL、共有権限の純粋関数テスト。
- **ツール**：Turborepo、GitHub Actions、strict TypeScript、ESLint、Husky、lint-staged、commitlint。

## リポジトリ構成

```text
apps/
├── api/          # Hono API、既定ポート 3001
└── web/          # React 管理画面、既定ポート 5173
packages/
├── db/           # Prisma schema、client、冪等な seed
├── shared/       # Web/API 共有の認可純粋関数
└── config/       # 共通 TypeScript / ESLint 設定
docs/
├── business/     # 業務ドキュメント（権威: モデル/認可/ルール/API/seed）
├── database/     # DB 方言の互換ルールと参照 DDL
└── archive/superpowers/  # 過去の設計仕様と実装計画（アーカイブ）
```

## 認可モデル

ユーザーの有効権限は、割り当てられた全ロールの**厳密な積集合**です。

```text
effectivePermissions(user) = role₁ ∩ role₂ ∩ ... ∩ roleₙ
```

- いずれかのロールが権限を持たない場合、結果は空です。スーパー管理者の例外はありません。
- `BUTTON` ノードは権限計算に参加しますが、ナビゲーションや動的ルートには表示されません。
- ナビゲーションツリーは祖先を補完し、空のディレクトリを折りたたみます。
- 権限コードは `module:resource:action` 形式です。例：`system:user:create`。
- API の `requirePermission(code)` が最終判定を行い、フロントエンドは表示だけを制御します。

アルゴリズムの実装は [`packages/shared/src/permissions.ts`](./packages/shared/src/permissions.ts) に一本化されています。

## 認証と OTP

Web と API の provider は一致させる必要があります。

```dotenv
# ローカルモード
VITE_AUTH_PROVIDER=local
AUTH_PROVIDER=local

# Clerk モード
VITE_AUTH_PROVIDER=clerk
VITE_CLERK_PUBLISHABLE_KEY="pk_..."
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY="sk_..."
```

開発環境の `DevOtpSender` はコードを API コンソールへ出力し、現在のプロセスメモリにだけ保持します。DB には常にハッシュだけを保存します。OTP の有効期限は 5 分、再送待機は 60 秒、試行回数は最大 5 回です。

## データベース

Prisma schema が実行時の source of truth で、`docs/database/schema.sql` は参照 DDL です。DB を切り替えるには：

1. `packages/db/.env` の `DATABASE_URL` を変更します。
2. `packages/db/prisma/schema.prisma` の `datasource.db.provider` を変更します。
3. migration と seed を実行します。

```bash
pnpm --filter @repo/db db:migrate -- --name switch-database
pnpm --filter @repo/db seed
```

方言差分は [データベースガイド](./docs/database/README.md) を参照してください。

## OpenAPI

Swagger UI：<http://localhost:3001/api/docs>

API を変更した後、契約とフロントエンド型を再生成します。

```bash
pnpm --filter @repo/api generate:openapi
pnpm --filter @repo/api generate:types
```

生成先は `apps/api/openapi.json` と `apps/web/src/api/schema.d.ts` です。API ソース変更時、pre-commit hook が両方を更新します。

## 開発

```bash
# 開発サービスをすべて起動
pnpm dev

# テスト、ビルド、lint
pnpm turbo test
pnpm turbo build
pnpm turbo lint

# デモデータを再作成
pnpm --filter @repo/db seed
```

API integration テストは専用 SQLite テスト DB を再構築し、開発 DB は変更しません。本番起動前に 32 文字以上のランダムな `JWT_SECRET` を設定してください。開発用プレースホルダーでは API は起動しません。

## ドキュメント

- [データベースと認可の意味論](./docs/database/README.md)
- [業務ドキュメント](./docs/business/README.md)
- [過去の設計仕様と実装計画（アーカイブ）](./docs/archive/superpowers/)
- [エージェント開発ガイド](./CLAUDE.md)

## コントリビューション

変更を提出する前に、次を実行してください。

```bash
pnpm turbo test
pnpm turbo build
pnpm turbo lint
```

コミットメッセージは [Conventional Commits](https://www.conventionalcommits.org/) に従います。大きな機能を始める前に設計仕様を読み、issue で方針を共有してください。
