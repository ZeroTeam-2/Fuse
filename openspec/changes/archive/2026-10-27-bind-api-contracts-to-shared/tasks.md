## 1. Shared: контракты тел запросов

- [x] 1.1 В `packages/shared/src/types/index.ts` добавить `PageSubmitDto` (`{ stepIndex: number; data: Record<string, unknown> }`) с комментарием о том, что это тело `POST /api/runs/:id/page-submit`; проверка — `pnpm --filter @fuse/shared build` проходит, тип экспортируется из `@fuse/shared`
- [x] 1.2 Удалить из `packages/shared/src/types/index.ts` неиспользуемые `ApiResponse` (L23) и `ApiErrorResponse` (L29); проверка — `git grep -w "ApiResponse\|ApiErrorResponse" -- apps packages` пусто, `pnpm typecheck` зелёный
- [x] 1.3 Удалить из `packages/shared/src/events/index.ts` неиспользуемые `ClientWsEvent` (L86) и `NotificationsServerEvent` (L103), сохранив `ServerWsEvent` и payload-типы, из которых он собран; проверка — `git grep -w "ClientWsEvent\|NotificationsServerEvent" -- apps packages` пусто, фронтенд типизируется (`pnpm --filter @fuse/frontend typecheck`)

## 2. Backend: DTO эндпоинтов исполнения

- [x] 2.1 Создать `apps/backend/src/execution/dto/create-run.dto.ts`: класс `CreateRunDto implements SharedCreateRunDto` с `@IsString() @IsNotEmpty() scenarioId` и `@IsOptional() @IsObject() inputs?`, swagger-описания через `@ApiProperty`/`@ApiPropertyOptional`; проверка — класс компилируется против интерфейса shared без `as`/`Omit`
- [x] 2.2 Создать `apps/backend/src/execution/dto/page-submit.dto.ts`: `PageSubmitDto implements SharedPageSubmitDto` с `@IsInt() @Min(0) stepIndex` (без `@Type`, см. design — «Без приведения типов в телах») и `@IsObject() data`
- [x] 2.3 Создать `apps/backend/src/execution/dto/submit-inputs.dto.ts`: `SubmitInputsDto implements SharedSubmitInputsDto` с `@IsInt() @Min(0) stepIndex` и `@IsObject() values`
- [x] 2.4 Заменить литеральные типы тел в `apps/backend/src/execution/execution.controller.ts` (L35 `create`, L100 `submitPageData`, L117 `submitInputs`) на новые DTO-классы; проверка — в файле не осталось `@Body() body: {`, `git grep -n "@Body() body: {" apps/backend/src` пусто
- [x] 2.5 Добавить тест `apps/backend/test/execution-body-validation.spec.ts` на четыре сценария дельта-спеки: отсутствующее `scenarioId`, неизвестное поле, `stepIndex` строкой и отрицательный, лишнее поле в `input-submit`; проверка — тест падает на текущем коде и проходит после 2.1–2.4
  - Проверка сделана на уровне `ValidationPipe` с явно переданным метатипом, а не по HTTP: vitest собирает тесты esbuild'ом, который не эмитит `design:paramtypes`, поэтому в тесте Nest не видит метатип тела и пайп пропускает любой запрос (замер: с метатипом `Object`, как у литерального типа, мусор проходит насквозь). Привязку контроллера к DTO держат 2.4 (литеральных тел не осталось) и 5.2 (живая проверка).

## 3. Backend: привязка существующих DTO к shared

- [x] 3.1 Добавить `implements` из `@fuse/shared` четырём классам, чьи поля совпадают с интерфейсами: `apps/backend/src/apps/dto/create-app.dto.ts`, `apps/backend/src/apps/dto/import-preview.dto.ts`, `apps/backend/src/scenarios/dto/create-scenario.dto.ts`, `apps/backend/src/users/dto/update-profile.dto.ts`; проверка — `pnpm typecheck` зелёный без правок полей
- [x] 3.2 В `apps/backend/src/scenarios/dto/update-scenario.dto.ts` сузить `steps?: unknown[]` до `Step[]` и `environmentSelections` до `EnvironmentSelection[]`, затем добавить `implements UpdateScenarioDto` из shared; проверка — `pnpm typecheck` показывает ошибки только в местах, где раньше стояло приведение
- [x] 3.3 Снять шесть приведений `as Step[]` в `apps/backend/src/scenarios/scenarios.service.ts` (L97, L99, L112, L115, L133 и далее по месту), ставших избыточными после 3.2; проверка — `git grep -c "as Step\[\]" apps/backend/src/scenarios/scenarios.service.ts` уменьшился до нуля, `pnpm --filter @fuse/backend test` зелёный
- [x] 3.4 Если сужение `steps` потянуло правки за пределы сервиса и тестов — зафиксировать объём в комментарии к PR; при превышении разумного объёма откатиться к `implements Omit<UpdateScenarioDto, "steps">` с TODO и явно отметить это в `tasks.md`
  - Условие не наступило: сужение `steps` не потянуло правок за пределы `scenarios.service.ts`, `pnpm typecheck` зелёный на всех трёх пакетах, откат к `Omit` не понадобился. Приведений оказалось четыре, а не шесть: `(s.steps ?? []) as Step[]` на L115 и L241/259/290 относятся к документам Mongo, а не к DTO, и остаются.

## 4. Фронтенд: синхронизация сгенерированных типов

- [x] 4.1 Поднять бэкенд (`pnpm infra && pnpm dev:main`) и перегенерировать типы: `pnpm gen:types`; проверка — в `apps/frontend/src/types/api.ts` тела трёх эндпоинтов исполнения ссылаются на именованные схемы `CreateRunDto`, `PageSubmitDto`, `SubmitInputsDto`, а не на инлайн-объекты
- [x] 4.2 Прогнать `pnpm --filter @fuse/frontend typecheck` и поправить места, где фронтенд полагался на старую инлайн-форму тела; проверка — typecheck зелёный

## 5. Проверка целиком

- [x] 5.1 `pnpm typecheck && pnpm test && pnpm lint` — зелёные
- [x] 5.2 Вживую по `/verify`: запустить сценарий из UI (успешный путь не изменился), затем `curl` с лишним полем в `POST /api/runs` → `400`, и `curl` с `stepIndex: "0"` в `page-submit` → `400`; проверка — ответы и статусы совпадают со сценариями дельта-спеки
  - Проверено curl'ом против живого бэкенда (seed-юзер, сценарий «Демо: задержка»): пять отклонений из дельта-спеки дают `400` с именами полей (`scenarioId should not be empty`, `property isAdmin should not exist`, `stepIndex must be an integer number`, `stepIndex must not be less than 0`, `property retryCount should not exist`), счётчик `db.runs` при этом не изменился (25 → 25). Корректное тело даёт `201`, запуск проходит через SQS и воркер до `completed`, тестовый запуск удалён (26 → 25). Прогон из UI не кликал: вместо этого проверены все пять мест, откуда фронтенд зовёт эти ручки (`PlaygroundPanel.vue`, `RunPanel.vue`, `my/runs/index.vue`, `useRunSocket.submitPage/submitInputs`) — все посылают ровно поля контракта, лишних нет.
