# bind-api-contracts-to-shared

## Why

Три POST-эндпоинта исполнения описывают тело запроса литеральным типом
(`@Body() body: { scenarioId: string; ... }`). Для такого параметра метатип —
`Object`, и глобальный `ValidationPipe` (`apps/backend/src/main.ts:17`, с
`whitelist` и `forbidNonWhitelisted`) пропускает тело целиком: `POST /api/runs`,
`POST /api/runs/:id/page-submit` и `POST /api/runs/:id/input-submit` принимают
любой JSON, который затем идёт в воркер, mapping-слой и в документ `Run`.
Остальные 13 эндпоинтов с телом валидируются — эти три выпали из общего
правила.

При этом контракты двух из трёх тел уже написаны: `CreateRunDto` и
`SubmitInputsDto` в `packages/shared/src/types/index.ts` описывают ровно эти
формы — и не используются ни бэкендом, ни фронтендом. Всего в shared семь
интерфейсов `*Dto`, из них пять — тёзки живых DTO-классов бэкенда, которые
никак с ними не связаны и расходятся молча: `UpdateScenarioDto` в shared
объявляет `steps?: Step[]`, а класс бэкенда — `steps?: unknown[]`, и сервис
шесть раз приводит их через `as Step[]`.

## What Changes

- `@fuse/shared` объявляется единственным источником правды для контрактов тел
  запросов: DTO-классы бэкенда объявляются как `implements` соответствующих
  интерфейсов shared, и расхождение полей становится ошибкой компиляции, а не
  молчаливым дрейфом.
- Три эндпоинта исполнения получают DTO-классы с `class-validator` в
  `apps/backend/src/execution/dto/` (`CreateRunDto`, `PageSubmitDto`,
  `SubmitInputsDto`); литеральные типы тел из контроллера уходят. Тела
  начинают валидироваться глобальным `ValidationPipe` наравне с остальными.
- В `packages/shared` добавляется `PageSubmitDto` — форма тела `page-submit`
  (`{ stepIndex, data }`) сейчас не описана нигде.
- Пять живых DTO-классов (`CreateAppDto`, `ImportPreviewDto`,
  `CreateScenarioDto`, `UpdateScenarioDto`, `UpdateProfileDto`) привязываются к
  одноимённым интерфейсам shared. В рамках привязки `UpdateScenarioDto.steps`
  сужается с `unknown[]` до `Step[]`, и шесть приведений `as Step[]` в
  `scenarios.service.ts` исчезают.
- Удаляются четыре типа shared, на которые нет ни одной ссылки в репозитории:
  `ApiResponse`, `ApiErrorResponse` (`types/index.ts`), `ClientWsEvent`,
  `NotificationsServerEvent` (`events/index.ts`).
- **BREAKING** (для внешних клиентов API): три эндпоинта исполнения начинают
  отвечать `400` на тело с неизвестными полями или неверными типами. Фронтенд
  платформы лишних полей не посылает — его поведение не меняется.

## Capabilities

### New Capabilities

_нет — новых пользовательских способностей изменение не добавляет._

### Modified Capabilities

- `scenario-execution`: добавляется требование о валидации тел запросов
  эндпоинтов исполнения (создание запуска, сабмит страницы, сабмит входов) —
  раньше спека молчала о том, что происходит с некорректным телом.

## Impact

- **Код (бэкенд)**: новые `apps/backend/src/execution/dto/create-run.dto.ts`,
  `page-submit.dto.ts`, `submit-inputs.dto.ts`;
  `apps/backend/src/execution/execution.controller.ts` (три подписи тел);
  `apps/backend/src/apps/dto/create-app.dto.ts`, `import-preview.dto.ts`,
  `apps/backend/src/scenarios/dto/create-scenario.dto.ts`,
  `update-scenario.dto.ts`, `apps/backend/src/users/dto/update-profile.dto.ts`
  (`implements`); `apps/backend/src/scenarios/scenarios.service.ts` (снятие
  приведений `as Step[]`).
- **Код (shared)**: `packages/shared/src/types/index.ts` (+`PageSubmitDto`,
  −`ApiResponse`, −`ApiErrorResponse`), `packages/shared/src/events/index.ts`
  (−`ClientWsEvent`, −`NotificationsServerEvent`).
- **Код (фронтенд)**: сгенерированный `apps/frontend/src/types/api.ts`
  перегенерируется (`pnpm gen:types`) — тела трёх эндпоинтов превращаются из
  инлайн-объектов в именованные схемы swagger.
- **Зависимости**: новых нет. `class-validator`/`class-transformer` остаются
  только в бэкенде, shared остаётся пакетом типов без рантайм-зависимостей.
- **Тесты**: `apps/backend/test/execution-*.spec.ts` (DI-контекст не меняется,
  но тела запросов в тестах контроллера — да); новый тест на отклонение
  некорректного тела.
- **Не входит в объём**: глубокая валидация структуры шагов
  (`steps[]`) в рантайме. `Step[]` здесь — утверждение системы типов, которое
  сервис и так делал приведением; нестед-валидация `class-validator` для
  шагов — отдельный change.
