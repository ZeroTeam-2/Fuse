## 1. Shared types & data model

- [ ] 1.1 Add `tag?: string` to `Endpoint` in `packages/shared/src/types/index.ts`
- [ ] 1.2 Add `EnvironmentVariable { key: string; value: string }` and `Environment { id: string; name: string; variables: EnvironmentVariable[] }` types + `environments?: Environment[]` on `App` in `packages/shared/src/types/index.ts`
- [ ] 1.3 Add `environmentSelections?: { appId: string; environmentId: string }[]` to `Scenario` in `packages/shared/src/types/index.ts`
- [ ] 1.4 Add `tag?` to `EndpointDoc`, and `VariableDoc { key, value }` + `EnvironmentDoc { id, name, variables: VariableDoc[] }` + `environments: EnvironmentDoc[]` on `App` in `apps/backend/src/apps/app.schema.ts` (keep `baseUrl`)
- [ ] 1.5 Add `environmentSelections` to the scenario schema in `apps/backend/src/scenarios/`

## 2. OpenAPI parsing — tags

- [ ] 2.1 Extend `OpenAPIOperation` interface and `extractEndpoints()` in `apps/backend/src/apps/openapi-parser.ts` to read `operation.tags?.[0]` into endpoint `tag`
- [ ] 2.2 Ensure `ImportPreviewResult` / preview mapping carries `tag` through to the frontend (shared type + controller/service)
- [ ] 2.3 Update or add parser unit test asserting tag extraction and empty-tag fallback

## 3. Backend — environments CRUD & execution

- [ ] 3.1 On app creation seed `environments = [{ name: 'Prod', variables: [{ key: 'baseUrl', value: <derived baseUrl> }] }]` in `apps.service.ts`
- [ ] 3.2 Add environment DTOs and endpoints in `apps.controller.ts`: `POST/PATCH/DELETE /api/apps/:id/environments[/:envId]`
- [ ] 3.3 Implement service logic: create/update/delete environment; forbid deleting Prod; enforce unique name; forbid removing the `baseUrl` variable; validate `baseUrl` value as absolute http(s) URL (reuse `base-url.ts`)
- [ ] 3.4 Resolve execution `baseUrl` in `apps/backend/src/execution/worker.service.ts`: scenario `environmentSelections` by step `appId` → environment `baseUrl` variable → fallback Prod → fallback `App.baseUrl` (via `joinBaseUrl()`)
- [ ] 3.5 Add idempotent backfill script (model on `scripts/backfill-app-base-url.mts`) seeding Prod environment (with `baseUrl` variable) for apps without `environments`
- [ ] 3.6 Regenerate frontend API types (`gen:types` → `apps/frontend/src/types/api.ts`)

## 4. Frontend — shared UI primitives

- [ ] 4.1 Fix `components/ui/EndpointRow.vue`: `min-w-0` container, truncate path, truncate/clamp long summary so it stays within container
- [ ] 4.2 Rewrite `components/ui/Pagination.vue` as windowed pagination (first/last, window around current, ellipsis markers, prev/next) keeping props `pageCount` / `v-model:page` / `change` event
- [ ] 4.3 Verify pagination in `pages/ui-kit.vue` demo with many pages (e.g. 50) and few pages (3)
- [ ] 4.4 Create `components/ui/EndpointGroupList.vue`: group endpoints by `tag` (untagged → «Прочее») into collapsible blocks with counts, integrate `SearchInput` cross-cutting search (method/path/summary/tag), auto-expand blocks with matches, optional `selectable` + `select` emit

## 5. Frontend — wire into pages

- [ ] 5.1 Provider detail `pages/my/apps/[id]/index.vue`: replace flat endpoint list with `EndpointGroupList` (grouped, searchable)
- [ ] 5.2 Import preview `pages/my/apps/new.vue`: render preview endpoints via `EndpointGroupList` (grouped, no overflow); apply to `pages/my/apps/[id]/update.vue` diff list as well
- [ ] 5.3 Step endpoint picker `components/scenario/StepPicker.vue`: replace flat searchable list with `EndpointGroupList` in selectable mode (unified search/group style)

## 6. Frontend — provider environments management UI

- [ ] 6.1 Add an Environments panel to provider detail `pages/my/apps/[id]/index.vue`: list environments, Prod badge (non-deletable), add/delete controls, edit the `baseUrl` variable per environment
- [ ] 6.2 Wire panel to `$api` environment endpoints; validate `baseUrl` client-side and surface backend errors
- [ ] 6.3 Handle backward-compat display: apps without `environments` show a Prod row derived from `baseUrl`

## 7. Frontend — scenario Environments tab

- [ ] 7.1 Add a distinct-providers getter to `stores/scenario-editor.ts` (unique `appId` across steps with an endpoint) and load each app's environments
- [ ] 7.2 Add an «Окружения» tab in `pages/my/scenarios/[id]/edit.vue`: one row per provider with a `Select` of that provider's environments, default Prod
- [ ] 7.3 Persist per-provider selection into scenario `environmentSelections`; default to Prod when unset; drop selections for providers no longer used

## 8. Verification

- [ ] 8.1 Import a spec with tags → preview shows collapsible blocks, no overflow on long descriptions; create app and confirm Prod environment seeded with `baseUrl` variable
- [ ] 8.2 Provider page: grouped endpoints + cross-cutting search work; StepPicker uses the same grouped/search UI
- [ ] 8.3 Pagination skips pages with ellipsis across app/marketplace/scenarios/profile lists
- [ ] 8.4 Create/edit/delete a non-Prod environment; confirm Prod cannot be deleted and `baseUrl` variable cannot be removed
- [ ] 8.5 In a scenario with steps from a provider, pick a non-Prod environment on the «Окружения» tab and confirm execution resolves the step against that environment's `baseUrl`; default (unset) resolves against Prod
- [ ] 8.6 Run `openspec validate improve-provider-endpoint-management --strict` and typecheck/build backend + frontend
