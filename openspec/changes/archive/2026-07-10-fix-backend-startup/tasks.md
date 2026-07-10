## 1. Make @fuse/shared a compiled package

- [x] 1.1 In `packages/shared/package.json`, set `main` to `./dist/index.js`, `types` to `./dist/index.d.ts`, and update `exports` (`.` → `./dist/index.js` import/require + `./dist/index.d.ts` types).
- [x] 1.2 Add a `dev` script to `packages/shared/package.json`: `tsc --watch` (so it participates in `pnpm -r --parallel run dev`).
- [x] 1.3 Run `pnpm --filter @fuse/shared build` and confirm a flat `dist/` is produced (`dist/index.js`, `dist/enums/index.js`, etc.).

## 2. Remove source-inlining paths from tsconfig

- [x] 2.1 Remove the `paths` block for `@fuse/shared` from `tsconfig.base.json`.
- [x] 2.2 Remove the `paths` block for `@fuse/shared` from `apps/backend/tsconfig.json`.
- [x] 2.3 Verify `apps/frontend/tsconfig.json` keeps its own `paths` override (no change needed; confirm only).

## 3. Wire shared build ordering into backend scripts

- [x] 3.1 Add `prebuild` to `apps/backend/package.json`: `pnpm --filter @fuse/shared build`.
- [x] 3.2 Ensure `dev:main` and `dev:worker` trigger an initial shared build (e.g. via a `predev` script or a shared prerequisite) so `dist/` exists before the first backend compile.
- [x] 3.3 Confirm `pnpm dev` (`pnpm -r --parallel run dev`) starts the shared watcher alongside the backend/worker.

## 4. Clean stale build artifacts

- [x] 4.1 Delete `apps/backend/dist` and `apps/backend/tsconfig.tsbuildinfo` so the next compile regenerates a flat tree.
- [x] 4.2 Verify `packages/shared/dist` is gitignored (add to `.gitignore` if not already covered).

## 5. Verify startup

- [x] 5.1 Run `pnpm run dev:main` and confirm the Nest app starts on `http://localhost:3001` with no `MODULE_NOT_FOUND`.
- [x] 5.2 Confirm `apps/backend/dist/main.js` exists at the flat path (no nested `dist/apps/backend/src/`).
- [x] 5.3 Run the worker (`pnpm run dev:worker`) and confirm `apps/backend/dist/worker.js` starts without `MODULE_NOT_FOUND`.

## 6. Type-check and lint

- [x] 6.1 Run `pnpm typecheck` (`pnpm -r run typecheck`) and confirm zero errors, with all `@fuse/shared` imports resolving.
- [x] 6.2 Run `pnpm lint` (`oxlint .`) and confirm it passes.
- [x] 6.3 Edit a file in `packages/shared/src/` during `pnpm dev` and confirm the backend recompiles against the updated shared output.
