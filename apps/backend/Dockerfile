# Собирается из корня монорепы:
#   docker build -f apps/backend/Dockerfile .
FROM node:24-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

FROM base AS build
# --ignore-scripts: корневой prepare-скрипт настраивает git-хуки и в образе
# падает (нет git и .githooks)
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @fuse/backend...
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @fuse/backend build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --ignore-scripts --prod --filter @fuse/backend...

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY apps/backend/package.json ./apps/backend/
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
EXPOSE 5173
CMD ["node", "apps/backend/dist/main"]
