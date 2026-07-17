## 1. Backend — shared spec-text parsing

- [x] 1.1 Create `apps/backend/src/apps/spec-text-parser.ts` exporting `parseSpecText(text: string, contentType: string): Record<string, unknown>` by moving `detectFormat`/`tryParse`/`parseSpecBody` logic out of `ssrf-guard.ts` (keep the module free of Nest decorators so backfill scripts can reuse it).
- [x] 1.2 Update `SsrfGuard.fetchSpec` (`ssrf-guard.ts:118`) to call the extracted `parseSpecText` instead of its private `parseSpecBody`; remove the now-dead private method and helpers from `ssrf-guard.ts`.
- [ ] 1.3 Verify URL-based import-preview/create still parse JSON and YAML identically (run existing app import flow manually).

## 2. Backend — parser base-URL override

- [x] 2.1 Extend `OpenApiParserService.parse` (`openapi-parser.ts:77`) signature to accept an optional `baseUrlOverride?: string`; when `deriveBaseUrl(spec, openapiUrl)` returns `undefined` and an override is provided, use the override as `baseUrl` and derive `host` from it via `extractHost`.
- [x] 2.2 Unit-check: a spec without `servers` parsed with `openapiUrl=""` and `baseUrlOverride="https://api.example.com"` yields `baseUrl`/`host` correctly; with no override and no `servers`, `baseUrl` is `undefined`.

## 3. Backend — file import service methods

- [x] 3.1 Add `importPreviewFile(specText: string, contentType: string, baseUrlOverride?: string): Promise<ImportPreviewResult>` to `AppsService` — parses text via `parseSpecText`, calls `openapiParser.parse(rawSpec, "", { baseUrlOverride })`, throws `BadRequestException` if `parsed.baseUrl` is `undefined` ("Не удалось определить базовый URL API…").
- [x] 3.2 Add `createFromFile(ownerId, { name, description, specText, contentType, baseUrlOverride }): Promise<AppDocument>` to `AppsService` — same parse path, saves `App` with `openapiUrl: ""`, `baseUrl`, `host`, `apiVersion`, `specSnapshot`, `endpoints`, `published: false`.

## 4. Backend — file import endpoints & DTOs

- [x] 4.1 Add `FileImportDto` (`apps/dto/file-import.dto.ts`) with `@IsString/@IsNotEmpty name`, optional `description`, optional `baseUrl` (`@IsUrl` when present) — used for create-from-file form fields.
- [x] 4.2 Add `POST /apps/import-preview-file` to `AppsController` using `@UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10*1024*1024 } }))`, `@ApiConsumes("multipart/form-data")`, `@ApiBody`; read file text + mimetype, call `appsService.importPreviewFile`.
- [x] 4.3 Add `POST /apps/from-file` to `AppsController` (same interceptor + Swagger decorators), read `name`/`description`/`baseUrl` form fields + file, call `appsService.createFromFile(req.user.userId, ...)`.
- [x] 4.4 Validate file presence, extension (`.json/.yaml/.yml`), and reject with `BadRequestException` on invalid input; ensure global `ValidationPipe` does not reject whitelisted multipart fields.
- [x] 4.5 Confirm NestJS `FileInterceptor`/multer is wired (already available via `@nestjs/platform-express`); no new dependency install needed.

## 5. Types & codegen

- [x] 5.1 Run `pnpm gen:types` to regenerate `apps/frontend/src/types/api.ts` from the backend Swagger schema so the two new multipart endpoints are typed for `openapi-fetch`.
- [x] 5.2 Confirm `ImportPreviewResult` in `packages/shared/src/types/index.ts` needs no change (file preview returns the same shape); add any missing type only if required.

## 6. Frontend — reusable Dropzone component

- [x] 6.1 Create `apps/frontend/components/ui/Dropzone.vue` — dashed border drop area, click-to-browse via hidden `<input type="file" accept=".json,.yaml,.yml,application/json,application/yaml,application/x-yaml,text/yaml">`, native `@dragover.prevent`/`@dragleave.prevent`/`@drop.prevent` handlers (mirror `PlaygroundPanel.vue:116-143`).
- [x] 6.2 Props: `accept`, `maxSize` (default 10MB), `disabled`; emits `select` with the chosen `File` (single). Client-side validation: single file, size ≤ maxSize, allowed extension/MIME; emit error string otherwise.

## 7. Frontend — creation flow file mode

- [x] 7.1 In `apps/frontend/pages/my/apps/new.vue`, add an input-mode toggle (URL / Файл) above the spec input; keep URL mode behavior unchanged.
- [x] 7.2 In file mode, render the `Dropzone` + an optional "Базовый URL API" `<Input type="url">` (shown always in file mode, prefilled when a file with absolute `servers[0].url` is previewed).
- [x] 7.3 Add `importPreviewFile()` calling `$api.POST("/api/apps/import-preview-file", { body: FormData })`; on success set `preview` and advance to step 2 (reuse existing preview UI).
- [x] 7.4 Add `createAppFromFile()` calling `$api.POST("/api/apps/from-file", { body: FormData })` with `name`, `description`, `baseUrl`, and the file; navigate to the new app on success.
- [x] 7.5 Surface import/create errors (file too large, bad extension, no base URL, invalid spec) in the existing error banner; clear the chosen file and preview when switching modes or going back.

## 8. Frontend — hide URL reimport for file-created apps

- [x] 8.1 In `apps/frontend/pages/my/apps/[id]/update.vue`, hide/disable the reimport-by-URL control when the app's `openapiUrl` is empty; show a note "Спецификация загружена файлом — повторный импорт файлом скоро."

## 9. Verification

- [ ] 9.1 Manual QA: import a YAML file, a JSON file, a spec without `servers` (require base URL), a spec with absolute `servers`, an oversized file (reject), a `.txt` file (reject), a malformed spec (reject).
- [ ] 9.2 Verify a created-from-file app's endpoints are usable in the scenario builder (step execution resolves against the saved `baseUrl`).
- [x] 9.3 Run backend lint/typecheck and frontend lint/typecheck; run `openspec validate add-api-yaml-drop-zone` and ensure the change is apply-ready.
