## Context

API apps are created in `apps/frontend/pages/my/apps/new.vue` via a two-step wizard: (1) enter an OpenAPI **URL** → backend fetches & parses → preview; (2) confirm → create. The backend pipeline (`apps/backend/src/apps/apps.service.ts`) is:

```
SsrfGuard.fetchSpec(url)  →  OpenApiParserService.parse(rawSpec, openapiUrl)  →  save App
```

- `fetchSpec` (`ssrf-guard.ts:118`) downloads the spec, enforces SSRF protection, and parses JSON/YAML via the private `parseSpecBody` (`ssrf-guard.ts:175`). `js-yaml` is already a dependency.
- `parse` (`openapi-parser.ts:77`) dereferences the spec, extracts endpoints, and calls `deriveBaseUrl(spec, openapiUrl)` (`base-url.ts:47`) to compute the app's `baseUrl`. `deriveBaseUrl` resolves `servers[0].url` relative to **the spec URL**; if `servers` is absent it falls back to the spec URL's origin.
- DTOs (`create-app.dto.ts`, `import-preview.dto.ts`) require `openapiUrl` (`@IsUrl`). The global `ValidationPipe` uses `forbidNonWhitelisted`, so any new field must be decorated.
- The frontend uses Nuxt 3 / Vue 3 with hand-rolled `reactive()` forms and `openapi-fetch`. A native drag-and-drop pattern already exists in `components/PlaygroundPanel.vue:116-143` (no dropzone library).
- The completed `add-yaml-spec-parsing` change added YAML support for URL fetches but explicitly deferred file upload as a non-goal.

The gap: users with local/private `.yaml`/`.json` specs cannot import them without hosting the file first.

## Goals / Non-Goals

**Goals:**
- Let users import an OpenAPI spec by dragging/dropping a local `.json`/`.yaml`/`.yml` file (or clicking to browse) as an alternative to entering a URL.
- Reuse the existing parse pipeline (`parseSpecBody` + `OpenApiParserService.parse`) so endpoint extraction is identical regardless of input source.
- Preserve the `baseUrl` invariant: every created app has a callable absolute `baseUrl` so scenario steps can execute.
- Keep the URL input path unchanged.

**Non-Goals:**
- Reimport-from-file for an existing app (`POST /:id/reimport` stays URL-only). File-uploaded apps store no `openapiUrl`; a future change can add re-upload.
- Client-side YAML parsing / instant preview before upload (backend preview remains source of truth).
- Persisting the uploaded file in MinIO — only the parsed `specSnapshot` is stored on the `App` doc, as today.
- Paste-as-text spec input (could reuse the same backend endpoint later).

## Decisions

### D1. Extract `parseSpecBody` into a reusable function
Make the JSON/YAML detection+fallback logic reusable instead of a private method on `SsrfGuard`. Extract `detectFormat`/`tryParse`/`parseSpecBody` into a standalone exported function `parseSpecText(text, contentType)` (e.g. in a new `spec-text-parser.ts` next to `base-url.ts`, kept free of Nest decorators so it can also be used by backfill scripts). `SsrfGuard.fetchSpec` calls it; the new file-upload service path calls it too.

**Rationale:** SSRF checks are irrelevant for an uploaded file (no outbound fetch), but the *parsing* must be identical. A shared function is the single source of truth for format detection. **Alternative considered:** make `parseSpecBody` public on `SsrfGuard` — rejected because it couples upload handling to an SSRF guard, muddying the guard's responsibility.

### D2. Two new multipart endpoints, keep URL endpoints untouched
Add to `apps.controller.ts`, mirroring the `FileInterceptor` pattern in `uploads.controller.ts:29` and `users.controller.ts:48`:
- `POST /apps/import-preview-file` — multipart `file` + optional `baseUrl` form field → returns `ImportPreviewResult`.
- `POST /apps` is **not** overloaded. Instead add `POST /apps/from-file` — multipart `file`, `name`, `description?`, `baseUrl?` → creates the app.

Both use `@UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10MB }, ... }))`, `@ApiConsumes("multipart/form-data")`, and `@ApiBody` for Swagger. Validate `name` non-empty, file presence, and extension/MIME.

**Rationale:** Mixing multipart and the existing JSON `@Body()` DTO on one route is fragile in NestJS (the global `ValidationPipe` + `forbidNonWhitelisted` rejects unknown multipart fields). Separate endpoints keep each path simple and typed. **Alternative considered:** single `POST /apps` with `openapiUrl` optional + `file` — rejected due to DTO/validation complexity.

### D3. `baseUrl` for file uploads — derive from `servers`, else require user input
For a file there is no spec URL, so `deriveBaseUrl(spec, openapiUrl)` loses its origin fallback. Decision:
- Call `openapiParser.parse(rawSpec, "")` — `deriveBaseUrl` returns `undefined` when `openapiUrl` is empty **unless** `servers[0].url` is absolute (the `new URL(serverUrl, specOrigin)` path still resolves an absolute server URL correctly because `new URL("https://x.com", badOrigin)` throws → caught → falls through... actually an absolute server URL resolves regardless of base). 

  To make this robust, extend `OpenApiParserService.parse` with an optional `baseUrlOverride?: string`. When `deriveBaseUrl` returns `undefined` and an override is provided, use the override (and derive `host` from it). This keeps host derivation in one place.
- The file-mode UI shows an optional **"Базовый URL API"** input. It is prefilled from `servers[0].url` when that is absolute. If after parse `baseUrl` is still `undefined` (no absolute servers and no user override), the import-preview/create call fails with HTTP 400: *"Не удалось определить базовый URL API. Укажите его в поле «Базовый URL API»."*

**Rationale:** Preserves the invariant that every app has a callable `baseUrl`. **Alternative considered:** store app with `baseUrl = undefined` and block later — rejected (silently breaks the step-execution contract). **Alternative considered:** require `servers` in uploaded specs — rejected (excludes FastAPI specs published without `servers`).

### D4. Frontend: input-mode toggle + reusable `Dropzone` component
In `new.vue`, add a two-option toggle (URL / Файл) above the spec input. URL mode keeps the existing `<Input type="url">`. File mode shows a new `components/ui/Dropzone.vue` (drag-and-drop + click-to-browse, hidden `<input type="file" accept=".json,.yaml,.yml,application/json,application/yaml,application/x-yaml,text/yaml">`), replicating the native DnD handlers from `PlaygroundPanel.vue:116-143`. Client-side validation: single file, ≤ 10 MB, allowed extension.

Extracting to `components/ui/Dropzone.vue` (not inline) so the `update.vue` reimport flow can reuse it later.

**Rationale:** Consistency and reuse; no new dependency (native HTML5 DnD). **Alternative considered:** add `vue-dropzone`/`vue-upload-component` — rejected; existing hand-rolled pattern is sufficient and avoids bundle bloat.

### D5. File-uploaded apps store `openapiUrl` as empty
The `App.openapiUrl` field becomes optional in practice for file-created apps (stored as `""` or `undefined`). `[id]/update.vue`'s reimport-by-URL button must be hidden/disabled when `openapiUrl` is empty, with a note "Спецификация загружена файлом — повторный импорт файлом скоро." (Re-upload is a non-goal here.)

**Rationale:** Avoids a fake/placeholder URL that would break `fetchSpec`. The schema already permits `openapiUrl` to be any string; no schema migration needed (Mongoose `Mixed`/string field).

### D6. No new backend dependencies
`multer` (`^2.2.0`) and `@nestjs/platform-express` (with `FileInterceptor`) are already installed; `js-yaml` already parses YAML. No new packages required on the backend. Frontend needs no new package (no client-side YAML parse in v1).

### D7. Shared types & generated frontend types
Add to `packages/shared/src/types/index.ts`: reuse the existing `ImportPreviewResult` shape (no change needed — file preview returns the same structure). For create-from-file, the response is the created `App` (same shape). After backend Swagger changes, run `pnpm gen:types` to regenerate `apps/frontend/src/types/api.ts` so `openapi-fetch` calls to the new multipart endpoints are typed.

## Risks / Trade-offs

- **[Two MODIFIED deltas on the same requirement]** The prior `add-yaml-spec-parsing` change also MODIFIES "Создание приложения с импортом OpenAPI" and is not yet archived. → Mitigation: this change's delta is written against the **current** main spec text and only *adds* file-upload scenarios/wording; coordinate archival order (archive the YAML change first, then this one) so deltas apply cleanly. If conflicts arise, re-sync the spec.
- **[Large/malicious files]** A 10 MB file is held in memory and dereferenced. → Mitigation: enforce 10 MB limit via `FileInterceptor` `limits.fileSize`; reject unknown extensions; reuse the existing `dereference` which already handles malformed specs by throwing `BadRequestException`.
- **[No SSRF on uploads]** Correct — uploads don't make outbound requests, so SSRF is N/A. The `assertSafeUrl` path is only for URL fetches.
- **[File-uploaded app has no URL for reimport]** Users can't one-click refresh. → Mitigation: surface a clear "loaded from file" state in the UI; re-upload is an explicit follow-up. Acceptable trade-off for v1.
- **[Multipart + global ValidationPipe]** Extra form fields not in a DTO get rejected. → Mitigation: new endpoints parse form fields manually from `req.body` / use a dedicated DTO with `@IsString` decorators on whitelisted text fields; document with `@ApiBody`.

## Migration Plan

1. Backend: extract `parseSpecText`; add `baseUrlOverride` to `parse`; add the two multipart endpoints + DTOs. No DB migration (`openapiUrl` already a plain string field).
2. Regenerate frontend types: `pnpm gen:types`.
3. Frontend: add `Dropzone.vue`; add mode toggle + file flow to `new.vue`; hide reimport-by-URL for file-created apps in `update.vue`.
4. Manual QA: import a YAML file, a JSON file, a spec without `servers` (must require base URL), an oversized file (reject), a non-spec file (reject).
5. Rollback: revert the new endpoints + UI; existing URL flow is untouched and remains fully functional.

## Open Questions

- Should create-from-file also accept an optional `openapiUrl` so a user can later switch to URL-based reimport? (Leaning: no for v1; keep file apps URL-less.)
- Do we want the `Dropzone` to also accept `.json` content pasted by dropping a file that has no extension? (Leaning: require a recognized extension/MIME for v1 clarity.)
