## Why

Сценарии часто вызывают API, которым нужен ключ или Bearer-токен, но в продукте нет места, куда владелец может один раз сохранить секрет для поставщика. Сейчас остаётся только ручной маппинг Header / `Bearer {{access_token}}` из предыдущего шага — это неудобно для статических API Key и не совпадает с вкладкой «Авторизация» в Design System. Без scenario-level ключей нельзя опубликовать готовый use-case, который другие запускают, не видя секрета владельца.

## What Changes

- В редакторе сценария появляется четвёртая вкладка **«Авторизация»** (рядом с Основная / Настройка шагов / Окружения): одна карточка на каждого поставщика из шагов; поле заголовка и значение ключа (SecretField).
- Ключи хранятся **на сценарии** (`authConfig` per `appId`): владелец вводит и видит значение; любой, кто может запустить сценарий, пользуется ключом владельца на сервере, но **не видит** `value` в API/UI.
- При импорте OpenAPI система извлекает **security schemes** (Bearer / apiKey in header) и сохраняет hint на приложении — им подставляются дефолты карточки; если схем нет или тип не поддержан — fallback `Authorization` / `X-Api-Key` / свой заголовок.
- У api/periodic-шага — флаг `authEnabled` и секция в панели шага (как в дизайне); на карточке шага — индикатор auth (shield).
- Worker при исполнении **инжектит** заголовок из `authConfig`, если `authEnabled` и ключ задан; явный маппинг/константа того же Header на шаге **переопределяет** инжект. Старый путь `Bearer {{access_token}}` сохраняется.
- Если у шага `authEnabled`, а ключа нет — шаг **падает доменной ошибкой** до HTTP (понятная диагностика, а не сырой 401).
- Хранение plaintext; redaction `value` для non-owner и публичных представлений; ключи не попадают в Run-логи / echo ошибок.

## Capabilities

### New Capabilities
- `scenario-api-auth`: хранение и redaction ключей доступа к API на уровне сценария (per provider), вкладка «Авторизация», видимость только владельцу при использовании ключа любым запускающим.

### Modified Capabilities
- `api-app-management`: при импорте OpenAPI извлекать и сохранять описание auth (scheme / header) из `securitySchemes` (+ security операций) для дефолтов UI.
- `scenario-builder`: четвёртая вкладка «Авторизация»; индикатор и секция auth в шаге; `authEnabled`; приоритет явного Header-маппинга над scenario key.
- `scenario-execution`: инжект auth-заголовка при исполнении api/periodic-шагов; override маппингом; fail при `authEnabled` без ключа; не логировать секреты.

## Impact

- **Shared** (`packages/shared`): типы `AppAuthHint`, `ScenarioAuthConfig` / entry per `appId`, поле `authEnabled` на api/periodic шагах, `authConfig` на `Scenario`.
- **Backend apps**: `openapi-parser.ts` (securitySchemes), `app.schema.ts` / сервис импорта.
- **Backend scenarios**: схема `authConfig`, redaction в GET/list/marketplace payloads для non-owner.
- **Backend execution**: `worker.service.ts` (+ mapping-resolver при необходимости) — inject / override / domain error.
- **Frontend**: вкладка в `pages/my/scenarios/[id]/edit.vue`, store, StepConfig / ScenarioStep (shield + секция), SecretField.
- Обратная совместимость: сценарии без `authConfig` и шаги без `authEnabled` ведут себя как сейчас; шаблон `Bearer {{access_token}}` не ломается.
