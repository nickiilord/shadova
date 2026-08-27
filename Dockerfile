# 多阶段构建：base（依赖+构建）→ runtime-api（Hono）+ runtime-web（nginx）
# 构建方式：docker compose build（根目录执行），或
#   docker build --target runtime-api -t shadova-api .
#   docker build --target runtime-web -t shadova-web .
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
# 先复制清单文件利用层缓存（pnpm-lock.yaml 不变则跳过 install）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api
COPY apps/web apps/web
# install 的 postinstall 会执行 prisma generate（schema 已复制）
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build
RUN pnpm prune --prod

FROM base AS runtime-api
ENV NODE_ENV=production
# 生产依赖与 workspace 编译产物
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

FROM nginx:alpine AS runtime-web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
