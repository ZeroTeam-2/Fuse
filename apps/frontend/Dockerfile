# Собирается из корня монорепы:
#   docker build -f apps/frontend/Dockerfile .
FROM node:24-alpine AS build
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/frontend/package.json apps/frontend/
# --ignore-scripts: корневой prepare-скрипт настраивает git-хуки и в образе
# падает (нет git и .githooks); нативные бинарники (esbuild и т.п.) ставятся
# через optional-зависимости и в postinstall не нуждаются
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @fuse/frontend...
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend
# env.schema валидируется при загрузке nuxt.config, поэтому на этапе сборки
# нужны валидные значения; реальные подставляются в рантайме через NUXT_*
ARG NUXT_PUBLIC_API_BASE_URL=/
RUN NUXT_PUBLIC_API_BASE_URL=$NUXT_PUBLIC_API_BASE_URL \
    NUXT_SESSION_SECRET=build-time-placeholder-0123456789abcdef \
    pnpm --filter @fuse/frontend build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=build /app/apps/frontend/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
