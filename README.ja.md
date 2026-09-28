<div align="center">
  <h1>Shadova</h1>
  <p><strong>契約駆動でテスト可能な、フルスタック RBAC 管理画面モノレポ。</strong></p>
  <p>
    <a href="https://github.com/nickiilord/shadova/actions/workflows/ci.yml"><img src="https://github.com/nickiilord/shadova/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node >=22">
    <img src="https://img.shields.io/badge/pnpm-9.12.0-orange.svg" alt="pnpm 9.12.0">
    <img src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" alt="Strict TypeScript">
  </p>
  <p>
    <a href="https://codespaces.new/nickiilord/shadova"><img src="https://github.com/codespaces/badge.svg" alt="Open in GitHub Codespaces"></a>
  </p>
  <p><a href="./README.md">简体中文</a> · <a href="./README.en.md">English</a> · 日本語</p>
</div>

![管理画面 · ユーザー](./docs/images/admin-users.png)

`Shadova` は、React 管理画面、Hono API、Prisma データ層、共有 RBAC ルールを 1 つの Turborepo にまとめたプロジェクトです。ローカル JWT、メール/SMS ワンタイムコード、Clerk 認証に対応し、同じ Zod/OpenAPI 契約から API ドキュメントとフロントエンド型を生成します。

> [!IMPORTANT]
> `admin / Admin@123` はローカルデモ専用です。デプロイ前に既定の認証情報を変更し、本番用シークレットと実際のメール/SMS 配信サービスを設定してください。

## Shadova を選ぶ理由

| 項目 | 内容 |
|---|---|
| **契約駆動** | 1 つの zod schema から実行時検証・OpenAPI ドキュメント・両アプリの TypeScript 型を生成します。契約成果物は pre-commit hook で再生成されるため、フロントエンドが黙って乖離しません |
| **認可は厳密な積集合** | 有効権限は割り当てられた全ロールの**積集合**で、スーパー管理者の例外はありません。実装は `packages/shared` に一本化し、メニュー・動的ルート・ボタン・API ミドルウェアで同じ意味論を共有します |
| **移植可能なデータ層** | 1 つの Prisma schema が SQLite / MySQL / PostgreSQL で動作し、方言固有機能を避けます（enum・再帰 CTE・JSONB を使わない） |
| **垂直スライスの完成度** | 11 モジュール（ユーザー / ロール / メニュー / 部門 / 辞書 / パラメータ / お知らせ / 通知 / ログ / セッション / ファイル）。各モジュールに API + ページ + 統合テストを用意 |
| **公開ポータル同梱** | `apps/portal` はログイン不要の独立ポータルアプリ（ヒーロー・カルーセル・コンテンツセクション・お問い合わせフォーム）で、同じバックエンドを共有します |
| **安全なデフォルト** | 本番 JWT シークレットの長さを検証し、OTP はハッシュのみ保存し、本番 Sender 未設定時は fail-closed になります |
| **検証可能な変更** | 3 層の Vitest + Playwright E2E（52 のクロスレイヤーケース）+ GitHub Actions の 5 ゲート（test / lint / typecheck / build / e2e） |

> 一般的な Next.js 製 admin テンプレートとの違い：バックエンドは **Hono**（エッジランタイムに配備可能）、**公開ポータルアプリ**を同梱、データ層は **3 方言で移植可能**です。

## スクリーンショット

| 管理画面 · 権限付与 | 公開ポータル |
|---|---|
| ![権限付与](./docs/images/admin-role-grant.png) | ![ポータル](./docs/images/portal-home.png) |

![Swagger UI（zod schema から生成）](./docs/images/api-docs.png)

## クイックスタート

### オンラインで試す（ローカル環境不要）

上部の **Open in GitHub Codespaces** バッジをクリックすると、依存関係のインストール・DB 作成・デモデータ投入まで済んだクラウド環境が作成され、3 つのサービスが自動起動してポートが転送されます。

| ポート | サービス |
|---|---|
| 5173 | 管理画面（`admin / Admin@123`） |
| 5174 | 公開ポータル |
| 3001 | API（Swagger UI は `/api/docs`） |

> 転送ポートは既定で private（自分のみ）です。エディタの **PORTS** パネルで右クリックすると Public に変更して共有できます。Codespaces は 30 分アイドルで自動停止し、再度開けば復帰します。

### 必要環境

- Node.js 22 以降
- pnpm 9.x（リポジトリでは `pnpm@9.12.0` を固定）

### ローカル実行

```bash
git clone https://github.com/nickiilord/shadova.git
cd shadova

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env

pnpm install
pnpm --filter @repo/db db:push
pnpm --filter @repo/db seed
pnpm dev
```

<http://localhost:5173>（管理画面）と <http://localhost:5174>（公開ポータル）を開いてください。API は <http://localhost:3001>、Swagger UI は <http://localhost:3001/api/docs> で利用できます。

デモ認証情報：`admin / Admin@123`。seed は冪等に再実行でき、このアカウントのパスワードとデモ用連絡先をリセットします。

## 機能

- **管理画面**：React 19、Vite、React Router、TanStack Query、Tailwind CSS、shadcn/ui。
- **ポータル**：公開シングルページ（`apps/portal`、ポート 5174）。ヒーロー、カルーセル、コンテンツセクション、連絡先・SNS リンク、お問い合わせフォームを備え、ブラウザ言語に応じた中英表示とサイト設定由来の SEO メタ情報を提供します。
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
├── web/          # React 管理画面、既定ポート 5173
└── portal/       # 公開ポータル（ログイン不要）、既定ポート 5174
packages/
├── db/           # Prisma schema、client、冪等な seed
├── shared/       # Web/API 共有の認可純粋関数
└── config/       # 共通 TypeScript / ESLint 設定
docs/
├── business/     # 業務ドキュメント（権威: モデル/認可/ルール/API/seed）
├── database/     # DB 方言の互換ルールと参照 DDL
└── review/       # 業務レビュー表（ラウンド別チェック基準）
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
- [業務レビュー表](./docs/review/business-rules.md)
- [エージェント開発ガイド](./CLAUDE.md)

## コントリビューション

開発ルールと提出前チェックは [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。規約の詳細は [AGENTS.md](./AGENTS.md) が唯一の情報源です。

コミットメッセージは [Conventional Commits](https://www.conventionalcommits.org/) に従います。大きな機能は、まず issue で方針を共有してください。
