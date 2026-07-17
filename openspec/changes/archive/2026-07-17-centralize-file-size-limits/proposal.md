## Why

Поднятие лимита загрузки спеки с 10 до 15 МБ уронило бэкенд с `RangeError [ERR_OUT_OF_RANGE]` в BSON-сериализаторе: документ `App` хранит развёрнутый (dereferenced) снапшот спецификации инлайном, и после разворачивания `$ref` он превышает жёсткий потолок MongoDB в 16 МБ. При этом поле `specSnapshot` пишется в трёх местах, но **нигде не читается** — это чистый источник раздувания документа.

По ходу вскрылась вторая, системная проблема: лимиты размера файлов раскиданы магическими числами по коду (`SPEC_FILE_SIZE_LIMIT` в контроллере, `10 * 1024 * 1024` в `Dropzone`, `15 * 1024 * 1024` в `new.vue`, `MAX_RESPONSE_BYTES` в SSRF-guard, `DEFAULT_PART_SIZE` в uploads, `maxMb: 15` в page-validator), и уже сейчас рассогласованы: дефолт `FILE_SINGLE_UPLOAD_MAX_MB` — 15 в env-схеме, 10 в сервисе, 10 в nuxt runtimeConfig. Нет единого источника правды, из-за чего фронт и бэк расходятся, а лимиты можно выставить физически недостижимыми.

## What Changes

- Убрать неиспользуемый `specSnapshot` из документа `App` (перестать писать его в `create`/`createFromFile`/`applyReimport`, удалить `@Prop`, убрать из результата парсера и seed). Это снимает раздувание документа — root cause BSON-ошибки.
- Ввести единый источник правды для всех лимитов размера файлов на бэкенде: расширить `env.schema.ts` явными переменными (`SPEC_FILE_MAX_MB`, `SPEC_URL_FETCH_MAX_MB`, плюс уже существующий `FILE_SINGLE_UPLOAD_MAX_MB`) и вынести производные константы в один конфиг-модуль вместо магических чисел по файлам.
- Заменить захардкоженные значения на чтение из конфига: `SPEC_FILE_SIZE_LIMIT` (apps.controller), `MAX_RESPONSE_BYTES` (ssrf-guard), `DEFAULT_PART_SIZE` (uploads) — все берутся из единого места.
- Свести дефолты `FILE_SINGLE_UPLOAD_MAX_MB` к одному значению (env-схема ↔ сервис ↔ nuxt runtimeConfig больше не расходятся).
- Прокинуть публичные лимиты (лимит спеки, single-upload) на фронт через nuxt `runtimeConfig.public`, чтобы `Dropzone` и `new.vue` не хардкодили `15 * 1024 * 1024`, а читали из конфига.
- Ограничить лимит загрузки спеки безопасным значением, гарантированно влезающим в документ Mongo после разворачивания, вместо физически недостижимых 15 МБ.

## Capabilities

### New Capabilities
- `file-size-limits`: единый, конфигурируемый источник правды для лимитов размера файлов (загрузка спеки, single/chunked upload, размер part, ограничение ответа при fetch спеки по URL), общий для бэкенда и фронтенда, без магических чисел в коде.

### Modified Capabilities
- `api-app-management`: лимит размера файла спецификации берётся из конфига и ограничен так, чтобы результат импорта гарантированно помещался в хранилище; полный развёрнутый снапшот спецификации больше не сохраняется инлайном в документе приложения.
- `step-pages`: дефолтный лимит размера файла для страницы «Загрузка файла» согласуется с единым конфигом лимитов вместо жёстко зашитого числа.

## Impact

- Бэкенд: `apps/backend/src/config/env.schema.ts`, новый конфиг-модуль лимитов, `apps/apps.controller.ts`, `apps/apps.service.ts`, `apps/app.schema.ts`, `apps/openapi-parser.ts`, `apps/ssrf-guard.ts`, `uploads/uploads.service.ts`, `scenarios/page-validator.ts`, `seed/seed.ts`.
- Фронтенд: `apps/frontend/nuxt.config.ts` (`runtimeConfig.public`), `components/ui/Dropzone.vue`, `pages/my/apps/new.vue`.
- Данные: существующие документы `App` с записанным `specSnapshot` продолжат читаться (поле опционально); новые перестанут его писать. Никаких миграций не требуется.
- Тесты: `apps/backend/test/upload-mode.spec.ts` (значения лимитов через конфиг).
- Конфигурация: новые env-переменные с безопасными дефолтами; `.env.example`/`.env.local.example` при наличии.
