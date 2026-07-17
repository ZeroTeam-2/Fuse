## 1. Конфигурация лимитов (бэкенд)

- [ ] 1.1 В `apps/backend/src/config/env.schema.ts` добавить переменные: `SPEC_FILE_MAX_MB` (default `15`), `SPEC_URL_FETCH_MAX_MB` (default `10`), `UPLOAD_PART_SIZE_MB` (default `5`); все `z.string().default(...).transform(Number)`
- [ ] 1.2 Свести `FILE_SINGLE_UPLOAD_MAX_MB` к единому дефолту `10` в env-схеме (согласовать с сервисом и nuxt)
- [ ] 1.3 Создать `apps/backend/src/config/file-limits.config.ts` — провайдер/`registerAs("fileLimits", ...)`, отдающий лимиты в байтах (`mb * 1024 * 1024`) из `ConfigService`
- [ ] 1.4 Зарегистрировать конфиг лимитов в `app.module.ts` (или экспортировать из `ConfigModule`), убедиться что он инжектируется в apps/uploads модули

## 2. Замена магических чисел на конфиг (бэкенд)

- [ ] 2.1 `apps/apps.controller.ts`: убрать литерал `SPEC_FILE_SIZE_LIMIT = 15*1024*1024`, брать лимит спеки из конфига для обоих `FileInterceptor` (`import-preview-file`, `from-file`)
- [ ] 2.2 `apps/ssrf-guard.ts`: заменить `MAX_RESPONSE_BYTES = 10*1024*1024` на значение из конфига (`SPEC_URL_FETCH_MAX_MB`); текст ошибки «Response exceeds N MB» вывести из лимита
- [ ] 2.3 `uploads/uploads.service.ts`: `DEFAULT_PART_SIZE` брать из конфига (`UPLOAD_PART_SIZE_MB`); выровнять фолбэк `FILE_SINGLE_UPLOAD_MAX_MB ?? 10` с env-дефолтом
- [ ] 2.4 `scenarios/page-validator.ts`: дефолт `maxMb` в `createDefaultPage("file")` брать из общей константы/конфига вместо литерала `15`

## 3. Удаление specSnapshot (root cause BSON-ошибки)

- [ ] 3.1 `apps/app.schema.ts`: удалить `@Prop() specSnapshot`
- [ ] 3.2 `apps/openapi-parser.ts`: убрать `specSnapshot` из типа `ParsedSpec` и из возвращаемого объекта (`specSnapshot: spec`)
- [ ] 3.3 `apps/apps.service.ts`: убрать запись `specSnapshot` в `create`, `createFromFile`, `applyReimport`
- [ ] 3.4 `seed/seed.ts`: убрать поле `specSnapshot` из типа и всех сидов (4 места `specSnapshot: {}`)
- [ ] 3.5 Проверить, что `grep -rn specSnapshot apps/backend/src` не даёт результатов (кроме `dist`)

## 4. Публичные лимиты на фронтенде

- [ ] 4.1 `apps/frontend/nuxt.config.ts`: в `runtimeConfig.public` добавить `specFileMaxMb` (из `NUXT_PUBLIC_SPEC_FILE_MAX_MB`, default `15`); выровнять `fileSingleUploadMaxMb` с бэком
- [ ] 4.2 `components/ui/Dropzone.vue`: убрать хардкод дефолта `maxSize: 10*1024*1024` — принимать лимит сверху; подпись «макс. N МБ» и валидация используют переданное значение
- [ ] 4.3 `pages/my/apps/new.vue`: заменить `:max-size="15 * 1024 * 1024"` на значение из `useRuntimeConfig().public.specFileMaxMb`

## 5. Тесты и проверка

- [ ] 5.1 `apps/backend/test/upload-mode.spec.ts`: обновить ожидания под чтение лимитов из конфига / новый единый дефолт `FILE_SINGLE_UPLOAD_MAX_MB`
- [ ] 5.2 Прогнать бэкенд-тесты (`pnpm --filter @fuse/backend test`), убедиться что зелёные
- [ ] 5.3 Обновить `.env.example` / `.env.local.example` (при наличии) новыми переменными с дефолтами
- [ ] 5.4 Проверить импорт файла спеки end-to-end (`verify`): загрузка большого валидного файла спеки создаёт приложение без BSON-ошибки; файл сверх лимита отклоняется понятной ошибкой
