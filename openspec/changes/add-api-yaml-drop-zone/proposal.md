## Why

Today an API app can only be created by providing a public URL to an OpenAPI spec. The prior `add-yaml-spec-parsing` change added YAML parsing for URL-fetched specs but explicitly deferred file upload as a non-goal. Users with local `.yaml`/`.yml`/`.json` specs (e.g. unfinished, private, or behind a VPN) have no way to import them — they must host the file first. Adding a drag-and-drop file drop zone to the creation flow removes this friction.

## What Changes

- Add a file drop zone (drag-and-drop + click-to-browse) to the "Создать приложение" form in `apps/frontend/pages/my/apps/new.vue` as an alternative to the OpenAPI URL input.
- Accept `.json`, `.yaml`, and `.yml` files; validate size (≤ 10 MB) and content type on the client before upload.
- Add a backend endpoint that accepts a multipart spec file, parses JSON/YAML via the existing `parseSpecBody` pipeline, and returns an import preview (endpoints, host, apiVersion) — mirroring the current URL-based `import-preview` flow.
- Reuse `OpenApiParserService.parse()` for endpoint extraction so behavior is identical regardless of input source.
- Update `POST /apps` (create) to accept an uploaded spec (file or inline parsed spec) in addition to the existing `openapiUrl` path, storing the `specSnapshot` and derived endpoints as today.
- Regenerate frontend API types via `pnpm gen:types` after Swagger changes.
- Make the URL input and the drop zone mutually exclusive input modes (one or the other), surfaced as a toggle/tabs in the UI.

## Capabilities

### New Capabilities
<!-- None — file import is an alternative input to the existing API app creation flow, not a separate capability. -->

### Modified Capabilities
- `api-app-management`: The "Создание приложения с импортом OpenAPI" requirement changes to accept an uploaded spec file (YAML or JSON) as an alternative to a URL, including import-preview and create behavior.

## Impact

- **Frontend** (`apps/frontend`):
  - `pages/my/apps/new.vue` — add drop zone UI (replicate native DnD pattern from `components/PlaygroundPanel.vue`), input-mode toggle, client-side file validation, and call new file-based endpoints.
  - Possibly extract a reusable `Dropzone` component into `components/ui/` if it aids reuse (update.vue reimport flow could later use it).
  - Add `js-yaml` to `apps/frontend/package.json` if client-side preview/validation is desired (optional).
  - Regenerate `apps/frontend/src/types/api.ts` via `pnpm gen:types`.
- **Backend** (`apps/backend`):
  - `apps/apps/apps.controller.ts` — add multipart endpoint(s) using `FileInterceptor` (mirror `uploads.controller.ts` / `users.controller.ts` avatar pattern).
  - `apps/apps/apps.service.ts` — refactor `importPreview`/`create` to accept an in-memory spec text/object path that bypasses `SsrfGuard.fetchSpec()`, reusing `parseSpecBody` + `openapiParser.parse()`.
  - `apps/apps/ssrf-guard.ts` — expose/reuse `parseSpecBody` for file bodies (SSRF checks do not apply to uploads).
  - `apps/apps/dto/` — add/extend DTOs for file-based import-preview and create; respect global `ValidationPipe` (`forbidNonWhitelisted`).
  - `base-url.ts` — decide `deriveBaseUrl` behavior when no spec URL is available (fall back to `servers[0].url` only).
- **Shared types** (`packages/shared/src/types/index.ts`) — add file-based import result/DTO shapes if needed.
- **Spec** (`openspec/specs/api-app-management/spec.md`) — delta update to creation requirement.
- **Dependencies:** `multer` already present; `js-yaml` already on backend. No new backend deps required.
