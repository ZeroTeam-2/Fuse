# Структура проекта Fuse

## Монорепозиторий

Проект построен на **pnpm workspaces** и состоит из двух приложений и одного общего пакета.

```mermaid
graph TD
    root["Fuse (root)\npnpm workspace"]

    root --> apps["apps/"]
    root --> packages["packages/"]
    root --> docker["docker-compose.yml\nMongoDB"]
    root --> githooks[".githooks/\ncommit-msg"]
    root --> tooling["Tooling\noxlint.json\ncommitlint.config.ts\ntsconfig.base.json"]

    apps --> frontend["apps/frontend\nNuxt 3"]
    apps --> backend["apps/backend\nNestJS"]

    packages --> shared["packages/shared\n@fuse/shared\nобщие типы / интерфейсы"]

    frontend -->|"workspace:*"| shared
    backend -->|"workspace:*"| shared
```

## Файловая структура

```
Fuse/
├── .githooks/
│   └── commit-msg              # нативный git hook → commitlint
├── apps/
│   ├── frontend/               # Nuxt 3
│   │   ├── pages/
│   │   ├── plugins/
│   │   │   └── api.ts          # openapi-fetch клиент
│   │   ├── src/
│   │   │   └── types/
│   │   │       └── api.ts      # авто-генерация (не редактировать)
│   │   ├── nuxt.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── backend/                # NestJS
│       ├── src/
│       │   ├── app.module.ts   # MongooseModule
│       │   ├── main.ts         # Swagger + Scalar
│       │   └── ...
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── shared/                 # @fuse/shared
│       ├── src/
│       │   └── index.ts        # TS типы / интерфейсы
│       ├── tsconfig.json
│       └── package.json
├── docs/
│   └── base/
│       └── structure.md        # этот файл
├── docker-compose.yml          # MongoDB (dev)
├── .env.example
├── package.json                # корневой workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── oxlint.json
├── commitlint.config.ts
├── .gitignore
└── .nvmrc
```

## Стек технологий

```mermaid
graph LR
    subgraph frontend ["Frontend (apps/frontend)"]
        nuxt["Nuxt 3"]
        zod["zod\nвалидация"]
        ofetch["openapi-fetch\ntype-safe HTTP"]
        apiTypes["types/api.ts\nавто-генерация"]
    end

    subgraph backend ["Backend (apps/backend)"]
        nest["NestJS\n+ Express"]
        mongoose["Mongoose\n+ MongoDB"]
        swagger["@nestjs/swagger\nOpenAPI"]
        scalar["@scalar\nDocs UI"]
        cv["class-validator\nclass-transformer"]
    end

    subgraph shared ["packages/shared"]
        types["TS интерфейсы\nобщие типы"]
    end

    subgraph infra ["Infrastructure"]
        mongo[("MongoDB\ndocker-compose")]
    end

    nuxt --> ofetch
    ofetch --> apiTypes
    nuxt --> zod
    nuxt --> types

    nest --> mongoose
    nest --> swagger
    swagger --> scalar
    nest --> cv
    nest --> types

    mongoose --> mongo
```

## Поток OpenAPI типов

Схема автоматической синхронизации типов между бэком и фронтом без ручного дублирования.

```mermaid
sequenceDiagram
    participant Dev as Разработчик
    participant Back as NestJS Backend
    participant Script as pnpm gen:types
    participant OT as openapi-typescript
    participant Front as Nuxt Frontend

    Dev->>Back: pnpm dev (запуск бэка)
    Back-->>Back: генерирует OpenAPI схему\nиз декораторов @ApiProperty
    Dev->>Script: pnpm run gen:types
    Script->>Back: GET /api/schema.json
    Back-->>Script: OpenAPI JSON схема
    Script->>OT: openapi-typescript
    OT-->>Front: apps/frontend/src/types/api.ts
    Front-->>Front: openapi-fetch использует\nсгенерированные типы
    Dev->>Dev: полная типобезопасность\nHTTP-вызовов
```

## Валидация данных

```mermaid
flowchart LR
    subgraph frontValidation ["Frontend — zod"]
        formInput["Ввод пользователя"]
        zodSchema["zod schema\n.parse() / .safeParse()"]
        formInput --> zodSchema
    end

    subgraph backValidation ["Backend — class-validator"]
        dto["DTO класс\n@IsString, @IsEmail..."]
        pipe["ValidationPipe\n(глобальный)"]
        dto --> pipe
    end

    zodSchema -->|"валидный запрос"| pipe
    pipe -->|"невалидный"| err["400 Bad Request"]
    pipe -->|"валидный"| handler["Controller handler"]
```

## Валидация переменных окружения (.env)

Единый инструмент — **zod** — и на фронте, и на бэке. Приложение не запустится, если `.env` не соответствует схеме.

```mermaid
flowchart TD
    subgraph backEnv ["Backend (NestJS)"]
        dotenv["process.env\n(.env файл)"]
        envSchema["apps/backend/src/config/env.schema.ts\nzod schema"]
        configModule["@nestjs/config\nConfigModule.forRoot({ validate })"]
        appStart["Приложение запущено"]
        crashBack["Процесс завершён\nошибка валидации"]

        dotenv --> configModule
        configModule --> envSchema
        envSchema -->|"ok"| appStart
        envSchema -->|"fail"| crashBack
    end

    subgraph frontEnv ["Frontend (Nuxt 3)"]
        runtimeConfig["useRuntimeConfig()\nruntimeConfig.public.*"]
        envSchemaFront["apps/frontend/nuxt.config.ts\nzod schema (fail-fast)"]
        nuxtStart["Приложение запущено"]
        crashFront["Ошибка при старте Nuxt\nсервера"]

        runtimeConfig --> envSchemaFront
        envSchemaFront -->|"ok"| nuxtStart
        envSchemaFront -->|"fail"| crashFront
    end
```

### Backend — реализация

```
apps/backend/src/config/
├── env.schema.ts      # zod схема переменных
└── env.config.ts      # typed ConfigService helper
```

**`apps/backend/src/config/env.schema.ts`:**

```typescript
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3001").transform(Number),
  MONGODB_URL: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
```

**`apps/backend/src/app.module.ts`** — передаём `validate` в `ConfigModule`:

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  validate: (config) => {
    const result = envSchema.safeParse(config);
    if (!result.success) throw new Error(result.error.toString());
    return result.data;
  },
});
```

### Frontend — реализация

Nuxt разделяет переменные на **публичные** (`NUXT_PUBLIC_*` → `runtimeConfig.public`) и **серверные** (`NUXT_*` → `runtimeConfig`). Валидация происходит в `nuxt.config.ts` до старта приложения (fail-fast).

```
apps/frontend/config/
└── env.schema.ts      # zod схема
```

**`apps/frontend/config/env.schema.ts`:**

```typescript
import { z } from "zod";

export const publicEnvSchema = z.object({
  apiBaseUrl: z.string().min(1, "NUXT_PUBLIC_API_BASE_URL is required"),
});

export const serverEnvSchema = z.object({
  sessionSecret: z
    .string()
    .min(32, "NUXT_SESSION_SECRET must be at least 32 characters"),
});
```

**`apps/frontend/nuxt.config.ts`** — загружает `../../.env` и валидирует до старта Nuxt:

```typescript
import { config as loadEnv } from "dotenv";
import { publicEnvSchema, serverEnvSchema } from "./config/env.schema";

loadEnv({ path: resolve(rootDir, "../../.env") });

const publicResult = publicEnvSchema.safeParse({
  apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "",
});
if (!publicResult.success)
  throw new Error(`[env] Public env validation failed: ...`);
```

## Git-workflow и инструменты качества

```mermaid
flowchart TD
    commit["git commit"]
    hook[".githooks/commit-msg\n(нативный git hook)"]
    commitlint["commitlint\n@commitlint/config-conventional"]
    ok["commit принят"]
    fail["commit отклонён\nневерный формат"]

    commit --> hook
    hook --> commitlint
    commitlint -->|"feat: ...\nfix: ...\nchore: ..."| ok
    commitlint -->|"плохое сообщение"| fail

    subgraph linting ["Линтинг (oxlint + oxc-formatter)"]
        oxlint["oxlint\npnpm lint"]
        oxfmt["oxc-formatter\npnpm format"]
    end
```

### Формат коммитов (Conventional Commits)

| Тип         | Назначение                          |
| ----------- | ----------------------------------- |
| `feat:`     | Новая функциональность              |
| `fix:`      | Исправление бага                    |
| `chore:`    | Рутинные задачи, зависимости        |
| `docs:`     | Документация                        |
| `refactor:` | Рефакторинг без изменения поведения |
| `test:`     | Тесты                               |
| `perf:`     | Оптимизация производительности      |
| `ci:`       | CI/CD конфигурация                  |

## Версионирование

Используется **changelogen** — автоматически формирует `CHANGELOG.md` на основе conventional commits.

```mermaid
flowchart LR
    commits["Conventional Commits"]
    changelogen["changelogen"]
    changelog["CHANGELOG.md"]
    tag["git tag vX.Y.Z"]
    push["git push --follow-tags"]

    commits --> changelogen
    changelogen --> changelog
    changelogen --> tag
    tag --> push
```

### Скрипты релиза

```bash
# Патч-версия (0.0.x) — багфиксы
pnpm version:patch

# Минорная версия (0.x.0) — новые фичи
pnpm version:minor

# Мажорная версия (x.0.0) — breaking changes
pnpm version:major
```

## Локальная разработка

```mermaid
flowchart TD
    start["Начало работы"]

    start --> install["pnpm install\n(активирует git hooks)"]
    install --> env["cp .env.example .env\n(заполнить переменные)"]
    env --> docker["docker compose up -d\n(запуск MongoDB)"]
    docker --> devAll["pnpm dev\n(запуск всех приложений)"]

    devAll --> frontDev["frontend :5173\nNuxt dev server"]
    devAll --> backDev["backend :3001\nNestJS dev server"]
    backDev --> scalarDocs["Scalar API Docs\n:3001/api/docs"]
    backDev --> schemaJson["/api/schema.json\nOpenAPI схема"]

    schemaJson --> genTypes["pnpm gen:types\n(обновить типы)"]
    genTypes --> apiTs["apps/frontend/src/types/api.ts"]
```
