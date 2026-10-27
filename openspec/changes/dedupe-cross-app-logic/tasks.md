## 1. Shared: общие помощники

- [ ] 1.1 Создать `packages/shared/src/files/index.ts` с `getExtension(name: string): string` (реализация из `apps.controller.ts:39`) и `ALLOWED_SPEC_EXTENSIONS` (`.json`, `.yaml`, `.yml`); проверка — юнит-тест в `packages/shared/tests/` на `report.json` → `.json`, `readme` → `""`, `.gitignore` → `.gitignore`, `A.YAML` → `.yaml`
- [ ] 1.2 Создать `packages/shared/src/filters/index.ts` с `OPERATOR_LABELS: Record<FilterOperator, string>` (значения из `mapping-resolver.ts:19`); проверка — удаление оператора из `FilterOperator` или добавление нового ломает компиляцию shared (убедиться вручную, затем вернуть)
- [ ] 1.3 Добавить `isBlank(value: unknown): boolean` в `packages/shared/src/pages/index.ts`; проверка — `pnpm --filter @fuse/shared test` зелёный
- [ ] 1.4 Перенести `ProviderDetail` из `apps/backend/src/marketplace/marketplace.service.ts:17` в `packages/shared/src/types/index.ts`; проверка — тип экспортируется из `@fuse/shared`, поля совпадают с ответом `GET /api/marketplace/cards/:id`
- [ ] 1.5 Реэкспортировать новые папки из `packages/shared/src/index.ts` (`./files`, `./filters`); проверка — `pnpm --filter @fuse/shared build` и импорт `import { getExtension, OPERATOR_LABELS, isBlank } from "@fuse/shared"` компилируются
- [ ] 1.6 Перевести `validateFileAgainstBlock()` в `packages/shared/src/pages/index.ts:110` на общий `getExtension()` вместо собственного `split(".").pop()`; проверка — существующие тесты страниц/файлов зелёные, добавлен случай имени без точки

## 2. Backend: убрать локальные копии

- [ ] 2.1 В `apps/backend/src/apps/apps.controller.ts` удалить локальные `getExtension()` и `ALLOWED_SPEC_EXTENSIONS` (L37–41), импортировать из `@fuse/shared`; проверка — `apps/backend/test/*.spec.ts` про импорт спеки зелёные, поведение отклонения `.txt` не изменилось
- [ ] 2.2 В `apps/backend/src/execution/manual-inputs.ts` удалить локальный `export function isBlank` (L317) и реэкспортировать/импортировать общий; проверка — `git grep -n "function isBlank" -- apps packages` оставляет единственное объявление в shared, `pnpm --filter @fuse/backend test` зелёный
- [ ] 2.3 В `apps/backend/src/execution/mapping-resolver.ts` удалить локальный `OPERATOR_LABELS` (L19), импортировать из `@fuse/shared`; проверка — `apps/backend/test/mapping-resolver.spec.ts` зелёный
- [ ] 2.4 В `apps/backend/src/marketplace/marketplace.service.ts` убрать локальное объявление `ProviderDetail`, импортировать тип из `@fuse/shared`; проверка — `apps/backend/test/marketplace.spec.ts` зелёный

## 3. Frontend: убрать локальные копии

- [ ] 3.1 В `apps/frontend/components/run/ManualInputsForm.vue` (L33) и `apps/frontend/components/run/PageRunner.vue` (L31) удалить локальные `isBlank`, импортировать из `@fuse/shared`; проверка — `git grep -c "function isBlank" -- apps/frontend` = 0, `pnpm --filter @fuse/frontend test` зелёный
- [ ] 3.2 В `apps/frontend/components/ui/Dropzone.vue` (L30–34) удалить локальные `getExtension`/`ALLOWED_EXTENSIONS`, импортировать из `@fuse/shared`; проверка — выбор `.txt` в дропзоне по-прежнему даёт ошибку формата, `.yaml` проходит
- [ ] 3.3 В `apps/frontend/pages/my/scenarios/[id]/edit.vue` (L371) удалить локальный `OPERATOR_LABELS`, импортировать типизированный из `@fuse/shared`; проверка — подписи условий в редакторе шага отображаются как раньше (`=`, `≠`, `содержит`)
- [ ] 3.4 В `apps/frontend/pages/cards/[id]/index.vue` (L141) удалить локальный `interface ProviderDetail`, импортировать тип из `@fuse/shared`; проверка — `pnpm --filter @fuse/frontend typecheck` зелёный

## 4. Backend: базовый пагинационный DTO

- [ ] 4.1 Создать `apps/backend/src/common/dto/pagination-query.dto.ts`: `PaginationQueryDto implements PaginationQuery` (из `@fuse/shared`) с `page`/`limit` и прежними декораторами и значениями по умолчанию (1 и 20, `@Min(1)`, `@Max(100)`); проверка — класс компилируется против интерфейса shared
- [ ] 4.2 Добавить тест наследования метаданных: контроллер-наследник принимает `?page=2&limit=5` и отклоняет `?unknown=1` статусом `400`; проверка — тест падает, если декораторы базового класса не наследуются (ключевое допущение design)
- [ ] 4.3 Переименовать класс в `apps/backend/src/apps/dto/pagination-query.dto.ts` в `AppsListQueryDto extends PaginationQueryDto`, оставив только поле `published`; обновить `apps/backend/src/apps/apps.controller.ts:68`; проверка — `GET /api/apps?page=2&limit=5&published=true` работает как раньше
- [ ] 4.4 Удалить `apps/backend/src/notifications/dto/pagination-query.dto.ts` и `apps/backend/src/scenarios/dto/pagination-query.dto.ts`, перевести `notifications.controller.ts:27` и `scenarios.controller.ts:36` на базовый `PaginationQueryDto`; проверка — списки уведомлений и сценариев отдают те же страницы, `pnpm --filter @fuse/backend test` зелёный
- [ ] 4.5 Привести `RunsListQueryDto` (`execution/dto/`) и `MarketplaceQueryDto` (`marketplace/dto/`) к `extends PaginationQueryDto`, оставив в них только собственные поля (`status`; `category`/`subcategory`/`search`/`sort`), и добавить `implements MarketplaceQuery` второму; проверка — `git grep -c "@Max(100)" apps/backend/src` = 1, фильтры и сортировка маркетплейса работают как раньше

## 5. Frontend: шапка в одном месте

- [ ] 5.1 Перенести разметку и логику шапки из `apps/frontend/layouts/default.vue` в `apps/frontend/components/ui/TopNav.vue`: `visibleNavItems`, `isActive`, `fullName`, меню пользователя с закрытием по клику вне и `Escape`, `logout`, кнопка входа для гостя, `NotificationsBell`, `sticky top-0 z-[100]`; удалить старые props/emits (`items`, `user`, `navigate`, `profile`) и демо-умолчание имени; проверка — `pnpm --filter @fuse/frontend typecheck` зелёный
- [ ] 5.2 В `apps/frontend/layouts/default.vue` оставить каркас страницы и `<TopNav />`; проверка — файл сократился до каркаса, в нём нет разметки `<header>`/`<nav>`
- [ ] 5.3 В `apps/frontend/pages/ui-kit.vue:133` рендерить `<TopNav />` без пропсов, удалить ставший ненужным `navItems`, если он больше не используется на странице; проверка — витрина открывается без ошибок в консоли
- [ ] 5.4 Живая проверка шапки по `/verify`: на `/`, `/my/scenarios` и `/ui-kit` — вид шапки, активная вкладка, открытие и закрытие меню (клик вне, `Escape`), выход, колокольчик уведомлений у авторизованного и гостевой вид у гостя

## 6. Проверка целиком

- [ ] 6.1 `pnpm typecheck && pnpm test && pnpm lint` — зелёные
- [ ] 6.2 Пересобрать граф кода и убедиться, что дублей больше нет: `graphify extract . --code-only --no-cluster --force && graphify cluster-only . --no-label`, затем `git grep -n "function isBlank\|function getExtension\|OPERATOR_LABELS" -- apps packages` оставляет по одному объявлению каждого в `packages/shared`
