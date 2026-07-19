# Tasks — reimport-spec-from-file

## 1. Backend

- [x] 1.1 `apps.service.ts`: вынести `diffEndpoints` и `mergeEndpoints` из `reimport`/`applyReimport`, добавить `reimportFromFile` и `applyReimportFromFile` (parseSpecText + `baseUrlOverride`; при apply `baseUrl`/`host` = `parsed.* ?? app.*`)
- [x] 1.2 `apps.controller.ts`: ручки `POST :id/reimport-file` и `POST :id/reimport-file/apply` (FileInterceptor, `validateSpecFile`, необязательный `baseUrl` в body)
- [x] 1.3 Unit-тесты `apps-reimport-file.spec.ts` (5 шт.): диф из файла, слияние с сохранением id, baseUrl при файле без servers, абсолютный servers из файла (поправлен `deriveBaseUrl` — раньше при пустом URL спеки сдавался даже на абсолютном servers), переопределение

## 2. Frontend

- [x] 2.1 `update.vue`: SegmentedControl «URL | Файл» (дефолт по наличию `openapiUrl`), файловая ветка — Dropzone + «Базовый URL API», заглушка удалена
- [x] 2.2 «Проверить обновления» и «Сохранить обновление» в файловом режиме шлют файл FormData в `reimport-file` / `reimport-file/apply`; смена режима сбрасывает диф и сообщения

## 3. Проверка

- [x] 3.1 Typecheck фронт+бэк чистый, unit-тесты бэкенда 184 ✓
- [x] 3.2 Headless на живом приложении «LLM Docs Recognizer» (создано из файла, `openapiUrl: null`): `reimport-file` с `api-1.yaml` → диф kept=3; apply → `baseUrl` сохранён (`http://10.46.142.217/llm-doc-recognizer`), `/task/{task_id}` получил выходы `status`, `result`, id endpoints не сменились (шаги сценария не отвязались)
