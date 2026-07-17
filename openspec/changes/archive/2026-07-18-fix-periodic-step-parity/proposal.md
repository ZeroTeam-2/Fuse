# fix-periodic-step-parity

## Why

Шаг «Периодический запрос» — это тот же вызов endpoint, что и «Endpoint API», только повторяемый раз в N секунд до признака завершения. Но при создании periodic-шага теряется ссылка на endpoint (`endpointId` не сохраняется), из-за чего бэкенд отдаёт для него пустую схему: в панели настройки пропали секции Path/Query/Header/Body-параметров, следующие шаги не видят его выходов, а воркер шлёт опрос без заголовков, тела и query-параметров. Пользователь не может настроить периодический запрос так же, как обычный, хотя по смыслу это одно и то же.

## What Changes

- `PeriodicStep` получает `endpointId` (как у `ApiStep`); конструктор шагов сохраняет его при выборе endpoint.
- `GET /api/scenarios/:id/step-schema/:index` возвращает для periodic-шага полную схему endpoint (inputs с `loc`, outputs, `outputIsArray`) — так же, как для api-шага. Для легаси-шагов без `endpointId` схема восстанавливается по совпадению `pollMethod` + `pollPath` среди endpoints приложения.
- Панель настройки шага показывает для periodic все секции входов (Path/Query/Header/Body) и выходные поля — за счёт восстановленной схемы, без отдельной логики во фронтенде.
- Воркер исполняет периодический опрос с полным разложением входов по местам: path-параметры в путь, query в строку запроса, header в заголовки, body в тело — на каждой итерации опроса (сейчас уходит голый `fetch(url, { method })`).
- Проверка работы шагов «Другой сценарий» и «Задержка» сквозным запуском — входит в задачи верификации этого изменения.

## Capabilities

### New Capabilities

_Нет._

### Modified Capabilities

- `scenario-builder`: periodic-шаг хранит ссылку на endpoint и настраивается идентично api-шагу — те же секции параметров по местам и те же выходные поля; отличие только в интервале опроса и поле прогресса.
- `scenario-execution`: воркер обязан раскладывать входы periodic-шага по местам запроса (path/query/header/body) на каждой итерации опроса — требование «Подстановка входов по месту в HTTP-запросе» распространяется на periodic-шаг явно.

## Impact

- `packages/shared/src/types/index.ts` — `PeriodicStep` (+`endpointId`).
- `apps/frontend/components/scenario/StepPicker.vue` — сохранение `endpointId` при создании periodic-шага.
- `apps/backend/src/scenarios/scenarios.service.ts` — `getStepSchema`/`getStepSchemaForStep`: ветка `periodic` (переиспользование `getApiStepSchema` + фолбэк по `pollMethod`/`pollPath` для легаси-шагов).
- `apps/backend/src/execution/worker.service.ts` — `executePeriodicStep`: входы endpoint в `groupInputsByLocation`, заголовки/тело/query в опросном `fetch`.
- Фронтенд-панель `StepConfig.vue` меняться не должна — она уже рендерит всё из схемы.
- Существующие сценарии с periodic-шагами продолжают работать: фолбэк по методу и пути закрывает шаги, созданные до появления `endpointId`.
