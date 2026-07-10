## Why

The backend (`apps/backend`) cannot start. `nest start --watch` compiles TypeScript successfully but produces output at `dist/apps/backend/src/main.js` instead of `dist/main.js`, so `node dist/main` crashes with `Cannot find module '.../dist/main'`. The root cause is a `tsconfig` `paths` mapping that pulls `@fuse/shared` source files (located outside the backend project root) into the compilation, expanding TypeScript's computed `rootDir` to the entire repo root and mirroring the full directory tree into `dist/`. This blocks all local development and the worker entry point is affected identically.

## What Changes

- Point `@fuse/shared` package entry points (`main`, `types`, `exports`) to its compiled `dist/` output instead of raw `.ts` source, making it a proper consumable workspace package.
- Remove the `paths` mappings for `@fuse/shared` from `tsconfig.base.json` and `apps/backend/tsconfig.json` so the backend build resolves the package through the pnpm workspace symlink to compiled JavaScript (no longer inlining shared source).
- Add a build/watch step for `@fuse/shared` so its `dist/` is available before the backend (and worker) compile/run.
- Ensure the backend `dist/` is flat (`dist/main.js`, `dist/worker.js`) matching the `nest start` / `node dist/main` entry point expectations.

## Capabilities

### New Capabilities
- `backend-build-pipeline`: Build configuration and startup contract — how `@fuse/shared` is consumed, how the backend/worker compile to a flat `dist/`, and the requirement that `node dist/main` / `node dist/worker` resolve correctly.

### Modified Capabilities
<!-- None — no spec-level (behavioral) requirements change. The fix restores the
     intended build/startup behavior without altering any documented capability. -->

## Impact

- **Affected code**: `packages/shared/package.json`, `tsconfig.base.json`, `apps/backend/tsconfig.json`, `apps/backend/package.json` (build ordering), root `package.json` (dev script orchestration).
- **Systems**: Backend (`apps/backend`) and Worker (`worker.ts`) startup. Frontend (`apps/frontend`) is unaffected — it keeps its own `paths` override and resolves shared via the Nuxt/Vite bundler.
- **Dependencies**: No new runtime dependencies. `@fuse/shared` is already a `workspace:*` dependency; only its resolution/build treatment changes.
- **Developer workflow**: `@fuse/shared` must be built (or watched) before the backend dev/build runs. This is handled via script orchestration so `pnpm dev` / `pnpm build` continue to work as before.
