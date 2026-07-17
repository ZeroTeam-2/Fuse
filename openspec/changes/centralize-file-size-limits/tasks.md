## 1. Конфигурация лимитов (бэкенд)

- [x] 1.1 В `apps/backend/src/config/env.schema.ts` добавить переменные: `SPEC_FILE_MAX_MB` (default `15`), `SPEC_URL_FETCH_MAX_MB` (default `10`); `z.string().default(...).transform(Number)`. _(Отклонение: `UPLOAD_PART_SIZE_MB` как env-переменную не добавлял — рантайм-потребителя настраиваемого размера part нет; размер part вынесен константой в `file-limits.constants.ts`.)_
- [x] 1.2 Свести `FILE_SINGLE_UPLOAD_MAX_MB` к единому дефолту `10` в env-схеме (согласовано с сервисом и nuxt; `.env.example` уже был `10`)
- [x] 1.3 Создать единый источник дефолтов `apps/backend/src/config/file-limits.constants.ts` (дефолты в МБ + `mbToBytes`). _(Отклонение: вместо `registerAs("fileLimits")` — плоские env-ключи + константы; проще, совместимо с моками в тестах, тот же «единый источник».)_
- [x] 1.4 Дефолты используются схемой env и потребителями через `ConfigService.get(...)`; `ConfigModule` глобальный — DI работает без доп. регистрации

## 2. Замена магических чисел на конфиг (бэкенд)

- [x] 2.1 `apps/apps.controller.ts`: убран литерал `SPEC_FILE_SIZE_LIMIT`; лимит спеки задаётся через `MulterModule.registerAsync` (ConfigService → `SPEC_FILE_MAX_MB`) в `apps.module.ts`, оба `FileInterceptor("file")` его наследуют
- [x] 2.2 `apps/ssrf-guard.ts`: `MAX_RESPONSE_BYTES` заменён на значение из конфига (`SPEC_URL_FETCH_MAX_MB`); текст ошибки «Response exceeds N MB» выводится из лимита
- [x] 2.3 `uploads/uploads.service.ts`: `DEFAULT_PART_SIZE` вынесен в `file-limits.constants.ts` (`mbToBytes(DEFAULT_UPLOAD_PART_SIZE_MB)`); фолбэк `FILE_SINGLE_UPLOAD_MAX_MB ?? DEFAULT_SINGLE_UPLOAD_MAX_MB` выровнен с env-дефолтом
- [x] 2.4 `scenarios/page-validator.ts`: дефолт `maxMb` в `createDefaultPage("file")` берётся из `DEFAULT_SINGLE_UPLOAD_MAX_MB` вместо литерала `15`

## 3. Удаление specSnapshot (root cause BSON-ошибки)

- [x] 3.1 `apps/app.schema.ts`: удалён `@Prop() specSnapshot`
- [x] 3.2 `apps/openapi-parser.ts`: убран `specSnapshot` из типа `ParsedSpec` и из возвращаемого объекта
- [x] 3.3 `apps/apps.service.ts`: убрана запись `specSnapshot` в `create`, `createFromFile`, `applyReimport`
- [x] 3.4 `seed/seed.ts`: убрано поле `specSnapshot` из типа и всех сидов (4 места). _(Прим.: реальный сид — `scripts/seed-local.mts` — `specSnapshot` не содержал; `scripts/backfill-app-base-url.mts` читает `specSnapshot` из СТАРЫХ документов через свой локальный тип — не затронут.)_
- [x] 3.5 `grep -rn specSnapshot apps/backend/src` пуст

## 4. Публичные лимиты на фронтенде

- [x] 4.1 `apps/frontend/nuxt.config.ts` + `config/env.schema.ts`: в `runtimeConfig.public` и `publicEnvSchema` добавлен `specFileMaxMb` (из `SPEC_FILE_MAX_MB`, default `15`); `fileSingleUploadMaxMb` выровнен
- [x] 4.2 `components/ui/Dropzone.vue`: убран хардкод `maxSize: 10*1024*1024` — дефолт из `runtimeConfig.public.specFileMaxMb`, родитель может передать явно; подпись «макс. N МБ» и валидация используют переданное значение
- [x] 4.3 `pages/my/apps/new.vue`: `:max-size` берётся из `useRuntimeConfig().public.specFileMaxMb` (computed `specMaxSizeBytes`)

## 5. Тесты и проверка

- [x] 5.1 `apps/backend/test/upload-mode.spec.ts`: изменений не потребовалось (сервис по-прежнему читает ключ `FILE_SINGLE_UPLOAD_MAX_MB`); `ssrf-guard.spec.ts` обновлён — `new SsrfGuard(mockConfigService)`
- [x] 5.2 Бэкенд-тесты зелёные: 17 файлов, 168 тестов; `tsc --noEmit` чист
- [x] 5.3 `.env.example` дополнен: `SPEC_FILE_MAX_MB`, `SPEC_URL_FETCH_MAX_MB` (бэкенд) и `SPEC_FILE_MAX_MB` (фронтенд-секция). `.env.local.example` — правок лимитов не требует
- [x] 5.4 Проверено end-to-end (backend на :3009, реальный HTTP + Mongo): (1) валидный файл спеки 14.13 МБ → `POST /api/apps/from-file` HTTP 200, приложение сохранено, `hasSpecSnapshot: false`, размер документа 0.02 МБ (раньше ~14 МБ+ → переполнение 16 МБ); в логах НЕТ `ERR_OUT_OF_RANGE`/BSON. (2) файл 16.04 МБ → HTTP 413 «File too large». (3) Config-driven доказано: при `SPEC_FILE_MAX_MB=5` тот же файл 14 МБ → 413, маленький → 200. Sibling `import-preview-file` парсит 14 МБ (200); `.txt` → 400.
