## 1. Shared types & data model

- [x] 1.1 Add `tag?: string` to `Endpoint` in `packages/shared/src/types/index.ts`
- [x] 1.2 Add `EnvironmentVariable { key: string; value: string }` and `Environment { id: string; name: string; variables: EnvironmentVariable[] }` types + `environments?: Environment[]` on `App` in `packages/shared/src/types/index.ts`
- [x] 1.3 Add `environmentSelections?: { appId: string; environmentId: string }[]` to `Scenario` in `packages/shared/src/types/index.ts`
- [x] 1.4 Add `tag?` to `EndpointDoc`, and `VariableDoc { key, value }` + `EnvironmentDoc { id, name, variables: VariableDoc[] }` + `environments: EnvironmentDoc[]` on `App` in `apps/backend/src/apps/app.schema.ts` (keep `baseUrl`)
- [x] 1.5 Add `environmentSelections` to the scenario schema in `apps/backend/src/scenarios/`

## 2. OpenAPI parsing — tags

- [x] 2.1 Extend `OpenAPIOperation` interface and `extractEndpoints()` in `apps/backend/src/apps/openapi-parser.ts` to read `operation.tags?.[0]` into endpoint `tag`
- [x] 2.2 Ensure `ImportPreviewResult` / preview mapping carries `tag` through to the frontend (shared type + controller/service)
- [x] 2.3 Update or add parser unit test asserting tag extraction and empty-tag fallback

## 3. Backend — environments CRUD & execution

- [x] 3.1 On app creation seed `environments = [{ name: 'Prod', variables: [{ key: 'baseUrl', value: <derived baseUrl> }] }]` in `apps.service.ts`
- [x] 3.2 Add environment DTOs and endpoints in `apps.controller.ts`: `POST/PATCH/DELETE /api/apps/:id/environments[/:envId]`
- [x] 3.3 Implement service logic: create/update/delete environment; forbid deleting Prod; enforce unique name; forbid removing the `baseUrl` variable; validate `baseUrl` value as absolute http(s) URL (reuse `base-url.ts`)
- [x] 3.4 Resolve execution `baseUrl` in `apps/backend/src/execution/worker.service.ts`: scenario `environmentSelections` by step `appId` → environment `baseUrl` variable → fallback Prod → fallback `App.baseUrl` (via `joinBaseUrl()`)
- [x] 3.5 Add idempotent backfill script (model on `scripts/backfill-app-base-url.mts`) seeding Prod environment (with `baseUrl` variable) for apps without `environments`
- [x] 3.6 Regenerate frontend API types (`gen:types` → `apps/frontend/src/types/api.ts`) against the running :3001 backend; env routes + `CreateEnvironmentDto`/`UpdateEnvironmentDto` + `environmentSelections` now in the typed client, frontend typecheck passes

## 4. Frontend — shared UI primitives

- [x] 4.1 Fix `components/ui/EndpointRow.vue`: `min-w-0` container, truncate path, truncate/clamp long summary so it stays within container
- [x] 4.2 Rewrite `components/ui/Pagination.vue` as windowed pagination (first/last, window around current, ellipsis markers, prev/next) keeping props `pageCount` / `v-model:page` / `change` event
- [x] 4.3 Verify pagination in `pages/ui-kit.vue` demo with many pages (e.g. 50) and few pages (3)
- [x] 4.4 Shared grouping rule in `utils/endpointGroups.ts` (tag → first path segment → «Прочее»), reused by both endpoint views
- [x] 4.5 Create `components/ui/EndpointGroupList.vue`: collapsible blocks with counts + `SearchInput` cross-cutting search + optional `selectable`/`select` (used by StepPicker & import preview)
- [x] 4.6 Create `components/ui/EndpointBrowser.vue`: master/detail — left category sidebar (name + count), right scrollable list of the active category (height follows the sidebar, min-h floor), `Pagination` underneath (25 per page), cross-cutting search that narrows categories + content and resets the page; rows expand on click to show `EndpointDetails`
- [x] 4.7 Per-method colours in `components/ui/MethodBadge.vue` (GET green, POST orange, PUT blue, DELETE red, OPTIONS sky, HEAD cyan, PATCH fuchsia; unknown → blue)
- [x] 4.8 Create `components/ui/EndpointDetails.vue` (inputs by location/type/required + example, outputs with array flag and element fields); `EndpointRow` gains optional `expandable`/`expanded` chevron

## 5. Frontend — wire into pages

- [x] 5.1 Provider detail `pages/my/apps/[id]/index.vue`: endpoints shown via `EndpointBrowser` (category sidebar + scrollable list + pagination, 25/page); Environments block placed above the endpoints section
- [x] 5.2 Import preview `pages/my/apps/new.vue`: render preview endpoints via `EndpointGroupList` (grouped, no overflow); apply the `EndpointRow` truncation fix to `pages/my/apps/[id]/update.vue` diff list (grouped by change type — added/deprecated — so no semantic-block grouping there)
- [x] 5.3 Step endpoint picker `components/scenario/StepPicker.vue`: replace flat searchable list with `EndpointGroupList` in selectable mode (unified search/group style)

## 6. Frontend — provider environments management UI

- [x] 6.1 Add a «Управление окружением» modal `components/ui/EnvironmentManager.vue` (structure per the reference screen, in the Fuse design system): left ENVIRONMENTS list + «Новое окружение», right pane with an environment header, a Base URL table (Модуль → Base URL, «Модуль по умолчанию» row, editable), and a Variables section with an empty state («Нет переменных»); opened via a «Управление окружениями» button on the provider page (inline panel removed, a read-only summary card remains)
- [x] 6.2 Wire the modal to `$api` environment endpoints (create/edit Base URL/delete, Prod non-deletable); validate `baseUrl` client-side and surface backend errors; parent refetches via `updated`
- [x] 6.3 Handle backward-compat display: apps without `environments` show a Prod row derived from `baseUrl`

## 7. Frontend — scenario Environments tab

- [x] 7.1 Add a distinct-providers getter to `stores/scenario-editor.ts` (unique `appId` across steps with an endpoint) and load each app's environments
- [x] 7.2 Add an «Окружения» tab in `pages/my/scenarios/[id]/edit.vue`: one row per provider with a `Select` of that provider's environments, default Prod
- [x] 7.3 Persist per-provider selection into scenario `environmentSelections`; default to Prod when unset; drop selections for providers no longer used

## 8. Verification

> 8.1–8.5 manually verified against the running dev stack — all behave correctly. Automated checks (8.6: typecheck + build for backend & frontend, parser unit tests, `openspec validate --strict`) all pass.

- [x] 8.1 Import a spec with tags → preview shows collapsible blocks, no overflow on long descriptions; create app and confirm Prod environment seeded with `baseUrl` variable
- [x] 8.2 Provider page: grouped endpoints + cross-cutting search work; StepPicker uses the same grouped/search UI
- [x] 8.3 Pagination skips pages with ellipsis across app/marketplace/scenarios/profile lists
- [x] 8.4 Create/edit/delete a non-Prod environment; confirm Prod cannot be deleted and `baseUrl` variable cannot be removed
- [x] 8.5 In a scenario with steps from a provider, pick a non-Prod environment on the «Окружения» tab and confirm execution resolves the step against that environment's `baseUrl`; default (unset) resolves against Prod
- [x] 8.6 Run `openspec validate improve-provider-endpoint-management --strict` and typecheck/build backend + frontend
