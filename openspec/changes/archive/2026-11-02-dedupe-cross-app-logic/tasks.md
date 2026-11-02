## 1. Shared: общие помощники

- [x] 1.1 Создать `packages/shared/src/files/index.ts` с `getExtension(name: string): string` (реализация из `apps.controller.ts:39`) и `ALLOWED_SPEC_EXTENSIONS` (`.json`, `.yaml`, `.yml`); проверка — юнит-тест в `packages/shared/tests/` на `report.json` → `.json`, `readme` → `""`, `.gitignore` → `.gitignore`, `A.YAML` → `.yaml`
- [x] 1.2 Создать `packages/shared/src/filters/index.ts` с `OPERATOR_LABELS: Record<FilterOperator, string>` (значения из `mapping-resolver.ts:19`); проверка — удаление оператора из `FilterOperator` или добавление нового ломает компиляцию shared (убедиться вручную, затем вернуть)
- [x] 1.3 Добавить `isBlank(value: unknown): boolean` в `packages/shared/src/pages/index.ts`; проверка — `pnpm --filter @fuse/shared test` зелёный
- [x] 1.4 Перенести `ProviderDetail` из `apps/backend/src/marketplace/marketplace.service.ts:17` в `packages/shared/src/types/index.ts`; проверка — тип экспортируется из `@fuse/shared`, поля совпадают с ответом `GET /api/marketplace/cards/:id`
- [x] 1.5 Реэкспортировать новые папки из `packages/shared/src/index.ts` (`./files`, `./filters`); проверка — `pnpm --filter @fuse/shared build` и импорт `import { getExtension, OPERATOR_LABELS, isBlank } from "@fuse/shared"` компилируются
- [x] 1.6 Перевести `validateFileAgainstBlock()` в `packages/shared/src/pages/index.ts:110` на общий `getExtension()` вместо собственного `split(".").pop()`; проверка — существующие тесты страниц/файлов зелёные, добавлен случай имени без точки

## 2. Backend: убрать локальные копии

- [x] 2.1 В `apps/backend/src/apps/apps.controller.ts` удалить локальные `getExtension()` и `ALLOWED_SPEC_EXTENSIONS` (L37–41), импортировать из `@fuse/shared`; проверка — `apps/backend/test/*.spec.ts` про импорт спеки зелёные, поведение отклонения `.txt` не изменилось
- [x] 2.2 В `apps/backend/src/execution/manual-inputs.ts` удалить локальный `export function isBlank` (L317) и импортировать общий (`worker.service.ts` берёт его прямо из `@fuse/shared`); проверка — `git grep -n "function isBlank" -- apps packages` оставляет единственное объявление в shared, `pnpm --filter @fuse/backend test` зелёный
- [x] 2.3 В `apps/backend/src/execution/mapping-resolver.ts` удалить локальный `OPERATOR_LABELS` (L19), импортировать из `@fuse/shared`; проверка — `apps/backend/test/mapping-resolver.spec.ts` зелёный
- [x] 2.4 В `apps/backend/src/marketplace/marketplace.service.ts` убрать локальное объявление `ProviderDetail`, импортировать тип из `@fuse/shared`; проверка — `apps/backend/test/marketplace.spec.ts` зелёный

## 3. Frontend: убрать локальные копии

- [x] 3.1 В `apps/frontend/components/run/ManualInputsForm.vue` (L33) и `apps/frontend/components/run/PageRunner.vue` (L31) удалить локальные `isBlank`, импортировать из `@fuse/shared`; проверка — `git grep -c "function isBlank" -- apps/frontend` = 0, `pnpm --filter @fuse/frontend test` зелёный
- [x] 3.2 В `apps/frontend/components/ui/Dropzone.vue` (L30–34) удалить локальные `getExtension`/`ALLOWED_EXTENSIONS`, импортировать из `@fuse/shared`; проверка — выбор `.txt` в дропзоне по-прежнему даёт ошибку формата, `.yaml` проходит
- [x] 3.3 В `apps/frontend/pages/my/scenarios/[id]/edit.vue` (L371) удалить локальный `OPERATOR_LABELS`, импортировать типизированный из `@fuse/shared`; проверка — подписи условий в редакторе шага отображаются как раньше (`=`, `≠`, `содержит`)
- [x] 3.4 В `apps/frontend/pages/cards/[id]/index.vue` (L141) удалить локальный `interface ProviderDetail`, импортировать тип из `@fuse/shared`; проверка — `pnpm --filter @fuse/frontend typecheck` зелёный

## 4. Backend: базовый пагинационный DTO

- [x] 4.1 Создать `apps/backend/src/common/dto/pagination-query.dto.ts`: `PaginationQueryDto implements PaginationQuery` (из `@fuse/shared`) с `page`/`limit` и прежними декораторами и значениями по умолчанию (1 и 20, `@Min(1)`, `@Max(100)`); проверка — класс компилируется против интерфейса shared
- [x] 4.2 Добавить тест наследования метаданных: наследник базового DTO, пропущенный через `ValidationPipe` с опциями из `main.ts`, принимает `page=2&limit=5`, держит границы `Min(1)`/`Max(100)` и отклоняет `unknown=1` статусом `400`; проверка — тест падает, если декораторы базового класса не наследуются (ключевое допущение design)
  - Проверка на уровне пайпа, а не HTTP: vitest собирает тесты через esbuild, он не эмитит `design:paramtypes`, и через контроллер `ValidationPipe` не видит метатип query и молча пропускает любой запрос (та же причина, что в `execution-body-validation.spec.ts`). Тест — `apps/backend/test/pagination-query.spec.ts`.
- [x] 4.3 Переименовать `apps/backend/src/apps/dto/pagination-query.dto.ts` в `apps-list-query.dto.ts`, а класс в нём — в `AppsListQueryDto extends PaginationQueryDto`, оставив только поле `published`; обновить `apps/backend/src/apps/apps.controller.ts:68`; проверка — `GET /api/apps?page=2&limit=5&published=true` работает как раньше
- [x] 4.4 Удалить `apps/backend/src/notifications/dto/pagination-query.dto.ts` и `apps/backend/src/scenarios/dto/pagination-query.dto.ts`, перевести `notifications.controller.ts:27` и `scenarios.controller.ts:36` на базовый `PaginationQueryDto`; проверка — списки уведомлений и сценариев отдают те же страницы, `pnpm --filter @fuse/backend test` зелёный
- [x] 4.5 Привести `RunsListQueryDto` (`execution/dto/`) и `MarketplaceQueryDto` (`marketplace/dto/`) к `extends PaginationQueryDto`, оставив в них только собственные поля (`status`; `category`/`subcategory`/`search`/`sort`), и добавить `implements MarketplaceQuery` второму; проверка — `git grep -c "@Max(100)" apps/backend/src` = 1, фильтры и сортировка маркетплейса работают как раньше

## 5. Frontend: шапка в одном месте

- [x] 5.1 Перенести разметку и логику шапки из `apps/frontend/layouts/default.vue` в `apps/frontend/components/ui/TopNav.vue`: `visibleNavItems`, `isActive`, `fullName`, меню пользователя с закрытием по клику вне и `Escape`, `logout`, кнопка входа для гостя, `NotificationsBell`, `sticky top-0 z-[100]`; удалить старые props/emits (`items`, `user`, `navigate`, `profile`) и демо-умолчание имени; проверка — `pnpm --filter @fuse/frontend typecheck` зелёный
- [x] 5.2 В `apps/frontend/layouts/default.vue` оставить каркас страницы и `<TopNav />`; проверка — файл сократился до каркаса, в нём нет разметки `<header>`/`<nav>`
- [x] 5.3 В `apps/frontend/pages/ui-kit.vue:133` рендерить `<TopNav />` без пропсов, удалить ставший ненужным `navItems`, если он больше не используется на странице; проверка — витрина открывается без ошибок в консоли
- [x] 5.4 Живая проверка шапки по `/verify`: на `/`, `/my/scenarios` и `/ui-kit` — вид шапки, активная вкладка, открытие и закрытие меню (клик вне, `Escape`), выход, колокольчик уведомлений у авторизованного и гостевой вид у гостя
  - Проверено в браузере (chrome-devtools MCP) против живых dev-серверов, юзер `seed@fuse.local`. Гость на `/`: в навигации только «Маркетплейс», кнопка «Войти», колокольчика и меню нет. Авторизованный: все четыре пункта, колокольчик, меню «Seed User»; активная «таблетка» (`bg-rose-50`) на `/` стоит на «Маркетплейс» (точное совпадение), на `/my/scenarios` — на «Мои сценарии». Меню открывается, закрывается по `Escape` и по клику вне. «Выйти» → кука снята, редирект на `/`, шапка сразу гостевая. На `/ui-kit` обе шапки (из layout и из витрины) дают одинаковый состав: те же четыре пункта, колокольчик, меню пользователя, `sticky`. Ошибок в консоли нет.
  - Проверка снята на дереве коммита `53c9813`, до merge main `9b0a0f6`. Позже main принёс настоящий логотип в `BrandMark` и форму локального входа в `LoginModal`, поэтому вид шапки сейчас отличается от описанного здесь — и отличается не из-за этого change.

## 6. Проверка целиком

- [x] 6.1 `pnpm typecheck && pnpm test && pnpm lint` — зелёные
  - Перепрогнано на дереве после merge main (`9b0a0f6`): typecheck 4/4, тесты 26 файлов / 235 тестов (включая `pagination-query.spec.ts` и пришедший из main `dev-login.spec.ts`), lint — 0 ошибок, 4 предсуществующих warning в файлах вне change.
- [x] 6.2 Пересобрать граф кода и убедиться, что дублей больше нет: `graphify extract . --code-only --no-cluster --force && graphify cluster-only . --no-label`, затем `git grep -n "function isBlank\|function getExtension\|OPERATOR_LABELS" -- apps packages` оставляет по одному объявлению каждого в `packages/shared`
  - Граф пересобран `graphify update .` (4574 узла, 7053 ребра). Символов, объявленных более чем в одном приложении, было 16, стало 13 — ушли ровно `isBlank`, `getExtension` и `ProviderDetail`. Оставшиеся 13 — DTO-классы бэкенда и их одноимённые интерфейсы в shared, связанные через `implements` (change `bind-api-contracts-to-shared`), плюс mongoose-схемы: это не копии логики. Grep (с `--untracked`, новые файлы ещё не в индексе) оставляет по одному объявлению: `getExtension` → `packages/shared/src/files/index.ts:2`, `OPERATOR_LABELS` → `packages/shared/src/filters/index.ts:8`, `isBlank` → `packages/shared/src/pages/index.ts:16`.
  - Перепроверено на графе, собранном на `9b0a0f6` (4719 узлов, 7253 ребра): ни одна из шести находок не вернулась, а новая логика main дублей через границу приложений не добавила — `safeEqual` объявлен один раз в `auth.controller.ts` (на `node:crypto`, в shared не переезжает), `DevLoginDto` не содержит `page`/`limit`, `LoginModal.vue` и `BrandMark.vue` парных объявлений на бэкенде не имеют.
