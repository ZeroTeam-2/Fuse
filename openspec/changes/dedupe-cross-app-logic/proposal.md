# dedupe-cross-app-logic

## Why

Анализ графа кода (`graphify`, 2237 узлов) нашёл четыре места, где одна и та же
логика объявлена дважды или трижды по обе стороны границы `apps/backend` ↔
`apps/frontend`, при живом общем пакете `@fuse/shared`, и пятое — внутри
бэкенда:

- `isBlank()` — три байт-в-байт одинаковых объявления:
  `apps/backend/src/execution/manual-inputs.ts:317` (экспортируется!),
  `apps/frontend/components/run/ManualInputsForm.vue:33`,
  `apps/frontend/components/run/PageRunner.vue:31`.
- `getExtension()` вместе с белым списком расширений — в
  `apps/backend/src/apps/apps.controller.ts:37-41` и
  `apps/frontend/components/ui/Dropzone.vue:30-34`. Списки совпадают сейчас, но
  ничто не держит их вместе: разойдутся — фронтенд разрешит файл, который бэк
  отклонит. Третий, inline-вариант того же вычисления расширения живёт в
  `packages/shared/src/pages/index.ts:110`.
- `OPERATOR_LABELS` — в `apps/backend/src/execution/mapping-resolver.ts:19` как
  `Record<FilterOperator, string>` и в
  `apps/frontend/pages/my/scenarios/[id]/edit.vue:371` как
  `Record<string, string>`. Из-за ослабленного типа новый оператор в
  `FilterOperator` не вызовет ошибку компиляции на фронтенде — подпись просто
  молча исчезнет из интерфейса.
- `ProviderDetail` — объявлен в `apps/backend/src/marketplace/marketplace.service.ts:17`
  и переписан руками в `apps/frontend/pages/cards/[id]/index.vue:141`.
- Блок `page`/`limit` с декораторами скопирован в пять query-DTO бэкенда
  (`apps`, `notifications`, `scenarios`, `execution`, `marketplace`), причём
  два из пяти классов не содержат вообще ничего, кроме этого блока. В
  `@fuse/shared` та же модель уже выражена наследованием
  (`MarketplaceQuery extends PaginationQuery`) — бэкенд ей не следует. На весь
  граф кода приходится 4 ребра `extends`.

Шестая находка того же анализа: `apps/frontend/components/ui/TopNav.vue`
подключён только в витрине `apps/frontend/pages/ui-kit.vue`, а боевая шапка
написана разметкой прямо в `apps/frontend/layouts/default.vue` — компонент
витрины и реальная шапка развиваются раздельно.

## What Changes

- Общие помощники переезжают в `@fuse/shared`, оба приложения импортируют их
  оттуда: `isBlank()`, `getExtension()` вместе со списком допустимых
  расширений спек, `OPERATOR_LABELS` (с типом `Record<FilterOperator, string>`,
  то есть новый оператор ломает компиляцию до того, как потеряется подпись), и
  тип `ProviderDetail`.
- `validateFileAgainstBlock()` в shared начинает использовать тот же
  `getExtension()` вместо собственного inline-вычисления расширения.
- В бэкенде появляется базовый `PaginationQueryDto`
  (`apps/backend/src/common/dto/`), реализующий `PaginationQuery` из shared.
  Пять query-DTO перестают повторять `page`/`limit`: два пустых класса
  (`NotificationsPaginationQueryDto`, `ScenarioPaginationQueryDto`) удаляются в
  пользу базового, три остальных наследуют его и добавляют только свои поля.
- Разметка шапки переезжает из `layouts/default.vue` в `TopNav.vue`; layout
  подключает компонент, витрина `ui-kit.vue` показывает боевую шапку.
- Поведение не меняется нигде: списки расширений, подписи операторов, границы
  и значения по умолчанию пагинации, вид и содержимое шапки остаются теми же.

## Capabilities

### New Capabilities

_нет._

### Modified Capabilities

_нет — чистый рефакторинг без изменения наблюдаемого поведения, в
`.openspec.yaml` установлен `skip_specs: true`._

## Impact

- **Код (shared)**: новые `packages/shared/src/files/index.ts` (расширения) и
  `packages/shared/src/filters/index.ts` (`OPERATOR_LABELS`), `isBlank()` в
  `packages/shared/src/pages/index.ts`, `ProviderDetail` в
  `packages/shared/src/types/index.ts`, реэкспорт в
  `packages/shared/src/index.ts`.
- **Код (бэкенд)**: новый `apps/backend/src/common/dto/pagination-query.dto.ts`;
  правятся `apps/backend/src/apps/dto/pagination-query.dto.ts` (переименование
  класса в `AppsListQueryDto`), `apps/backend/src/execution/dto/runs-list-query.dto.ts`,
  `apps/backend/src/marketplace/dto/marketplace-query.dto.ts`; удаляются
  `apps/backend/src/notifications/dto/pagination-query.dto.ts` и
  `apps/backend/src/scenarios/dto/pagination-query.dto.ts`; обновляются
  контроллеры `apps`, `notifications`, `scenarios`; из
  `apps/backend/src/apps/apps.controller.ts`, `execution/manual-inputs.ts`,
  `execution/mapping-resolver.ts`, `marketplace/marketplace.service.ts`
  удаляются локальные копии.
- **Код (фронтенд)**: `components/run/ManualInputsForm.vue`,
  `components/run/PageRunner.vue`, `components/ui/Dropzone.vue`,
  `pages/my/scenarios/[id]/edit.vue`, `pages/cards/[id]/index.vue` —
  импорт вместо локальных копий; `components/ui/TopNav.vue`,
  `layouts/default.vue`, `pages/ui-kit.vue` — переезд шапки.
- **Зависимости**: новых нет. Помощники в shared остаются без рантайм-зависимостей.
- **Swagger / типы фронта**: query-DTO попадают в схему как отдельные
  параметры (`page`, `limit`, …), а не как именованные схемы, поэтому имена
  классов в схеме не фигурируют и `apps/frontend/src/types/api.ts` не меняется.
- **Порядок**: change `bind-api-contracts-to-shared` правит те же файлы в
  `packages/shared` и `apps/backend/src/scenarios/dto/`, поэтому идёт первым;
  этот change ребейзится на него.
