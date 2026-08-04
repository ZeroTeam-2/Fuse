## 1. Shared types

- [x] 1.1 Добавить `AppAuthHint` (`schemeLabel`, `headerName`, `valueFormat: "bearer" | "raw"`, `required`) и опциональное `auth?: AppAuthHint` на `App` в `packages/shared`
- [x] 1.2 Добавить `ScenarioAuthEntry` (`appId`, `headerName`, `valueFormat`, `value?`, `configured?` только в ответах) и `authConfig?: ScenarioAuthEntry[]` на `Scenario` / `UpdateScenarioDto`
- [x] 1.3 Добавить `authEnabled?: boolean` на `ApiStep` и `PeriodicStep` (и при необходимости на deprecated `FileStep` для чтения)

## 2. Backend — OpenAPI auth hint

- [x] 2.1 В `openapi-parser.ts` извлекать поддерживаемые `securitySchemes` (+ security requirement) в `AppAuthHint`
- [x] 2.2 Сохранять `auth` на App при create/reimport; отдавать в API чтения приложения
- [x] 2.3 Юнит-тесты парсера: bearer, apiKey header, спека без security, oauth2 → без hint

## 3. Backend — scenario authConfig + redaction

- [x] 3.1 Поле `authConfig` в `scenario.schema.ts` и DTO update
- [x] 3.2 При update steps/authConfig чистить orphan-записи (appId без шагов), зеркало `environmentSelections`
- [x] 3.3 Хелпер `redactScenarioAuth(scenario, viewerUserId)`: owner видит `value`, остальные — без `value` + `configured`
- [x] 3.4 Применять redaction во всех ответах, где сценарий может уйти не-владельцу; owner GET/PATCH — полный value
- [x] 3.5 Тесты redaction и cleanup orphan authConfig

## 4. Backend — execution inject

- [x] 4.1 В worker перед HTTP api/periodic: при `authEnabled` найти authConfig; пустой ключ → доменная ошибка до fetch
- [x] 4.2 Инжект заголовка с учётом `valueFormat`; не перезаписывать, если header уже есть после резолва маппингов (case-insensitive)
- [x] 4.3 Исключить секреты из stepResults / сообщений ошибок / логов
- [x] 4.4 Тесты: inject bearer, inject apiKey, override маппингом, authEnabled false, missing key → failed

## 5. Frontend — вкладка и шаги

- [x] 5.1 `gen:types` после появления полей в OpenAPI бэкенда
- [x] 5.2 Вкладка «Авторизация» в `pages/my/scenarios/[id]/edit.vue` + store (список поставщиков, save authConfig)
- [x] 5.3 UI карточки поставщика по Design System: Select заголовка, SecretField, Save, empty state
- [x] 5.4 Дефолты header/format из `App.auth`; fallback Authorization / X-Api-Key / custom
- [x] 5.5 В StepConfig / StepPicker: `authEnabled` по умолчанию от hint; секция «Аутентификация» с тогглом/warning
- [x] 5.6 Shield на карточке шага при `authEnabled`

## 6. Проверка

- [x] 6.1 Ручной сценарий: импорт спеки с Bearer → ключ на вкладке → запуск с инжектом
- [x] 6.2 Чужой/marketplace запуск: ключ работает, value в API нет
- [x] 6.3 Override: константа Authorization на шаге побеждает authConfig
- [x] 6.4 `authEnabled` + пустой ключ → понятная ошибка без HTTP
- [x] 6.5 Спека без security: ручной X-Api-Key на вкладке работает
