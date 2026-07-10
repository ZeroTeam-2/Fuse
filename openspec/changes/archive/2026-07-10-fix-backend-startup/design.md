## Context

The Fuse backend (`apps/backend`, NestJS) is a CommonJS project compiled by `tsc` via the NestJS CLI (`nest start --watch` / `nest build`). It depends on `@fuse/shared`, a pnpm `workspace:*` package. Currently:

- `packages/shared/package.json` points `main`/`types`/`exports` at raw `.ts` source (`./src/index.ts`).
- `tsconfig.base.json` and `apps/backend/tsconfig.json` both define `paths` mapping `@fuse/shared` → the shared package's source files.

When `tsc` compiles the backend, it follows the `paths` mapping and pulls `packages/shared/src/**` into the program. Because those files live outside the backend project root, TypeScript computes a common `rootDir` equal to the repo root and reproduces the full monorepo tree in the output. The entry point lands at `dist/apps/backend/src/main.js`, while the NestJS CLI and `package.json` `start` script expect `dist/main.js`. The result:

```
Error: Cannot find module '.../apps/backend/dist/main'
```

The worker entry point (`worker`) fails identically. The frontend is unaffected because Nuxt/Vite resolves `@fuse/shared` through its own bundler and `paths` override; it never emits a `dist/main.js` via `tsc`.

This was verified end-to-end: applying the fix below produced `Nest application successfully started` on `http://localhost:3001`.

## Goals / Non-Goals

**Goals:**
- Make `nest start --watch` produce a flat `dist/main.js` / `dist/worker.js` so the backend and worker start without `MODULE_NOT_FOUND`.
- Treat `@fuse/shared` as a real compiled workspace package (consumed via `dist/`), eliminating source inlining via `paths`.
- Preserve the developer workflow (`pnpm dev`, `pnpm build`) with automatic shared-package build ordering and watch.
- Keep TypeScript type-checking green (`tsc --noEmit`) for the backend.

**Non-Goals:**
- Changing the frontend's resolution strategy (it keeps its own `paths` + bundler).
- Changing any runtime/API behavior or domain logic.
- Introducing a new task runner (turborepo, nx) — pnpm script orchestration is sufficient.
- Migrating the NestJS compiler to SWC/webpack (out of scope; the `tsc` pipeline stays).

## Decisions

### Decision 1: Consume `@fuse/shared` as compiled `dist/`
**Choice:** Update `packages/shared/package.json` so `main` → `./dist/index.js`, `types` → `./dist/index.d.ts`, and `exports` points at the compiled files.

**Rationale:** This is the idiomatic way to consume a workspace package that emits JavaScript. It guarantees runtime correctness (Node loads real `.js`) without relying on Node's experimental TypeScript type-stripping, and it keeps type-checking deterministic via `.d.ts`.

**Alternatives considered:**
- *Rely on Node 24 type-stripping of raw `.ts`:* Rejected — fragile, coupled to a specific Node version/flag, and the project's `engines` only requires Node ≥ 20. The shared package uses `as const` objects (not `enum`s) so stripping would mostly work, but it is not a production-grade contract.
- *NestJS `webpack`/`swc` bundler to flatten output:* Rejected — changes the compilation toolchain and has slower cold builds; doesn't fix the underlying package-resolution smell.

### Decision 2: Remove `@fuse/shared` `paths` from `tsconfig.base.json` and `apps/backend/tsconfig.json`
**Choice:** Delete the `paths` blocks in both configs. The backend resolves `@fuse/shared` through the pnpm workspace symlink → compiled package.

**Rationale:** `paths` is the direct cause of source inlining and the `rootDir` expansion. Without it, `tsc` resolves the dependency as a normal node_modules package (type-checked via its `types` field, not emitted into the backend output), so `rootDir` stays at the backend's `src/` and output is flat. The frontend keeps its own explicit `paths` in `apps/frontend/tsconfig.json`, so it is unaffected by removing the base-level mapping.

**Alternatives considered:**
- *Keep `paths` but point them at compiled `dist/`:* Rejected — `tsc` would still treat the resolved files as program inputs and could re-emit/affect output; relying on node_modules resolution is cleaner.
- *Set explicit `rootDir: "./src"` and keep paths:* Rejected — `tsc` errors with `File is not under rootDir` when out-of-root source is included via `paths`; not viable.

### Decision 3: Add build ordering + watch for `@fuse/shared`
**Choice:**
- Add a `dev` script to `@fuse/shared` (`tsc --watch`) so it participates in the parallel `pnpm -r --parallel run dev`.
- Add a `prebuild`/`predev` hook (or a shared build prerequisite) so the backend builds after shared is built. Specifically: add `prebuild: pnpm --filter @fuse/shared build` to `@fuse/backend`, and ensure `dev:main`/`dev:worker` trigger an initial shared build.

**Rationale:** Since shared is now compiled, its `dist/` must exist before the backend compiles. pnpm's `pre*` hooks and recursive `dev` handle this without a new tool. The `pnpm -r --parallel run dev` already runs all workspace `dev` scripts in parallel; giving shared a `dev` script keeps hot-reload on shared changes.

**Alternatives considered:**
- *Manual `pnpm --filter @fuse/shared build` before dev:* Rejected — poor DX, easy to forget.
- *Turbo/nx for cached task graphs:* Rejected as out of scope for this bug fix.

### Decision 4: Gitignore the shared `dist/`
**Choice:** Ensure `packages/shared/dist` is gitignored (already covered by the base `exclude`/`dist` patterns; verify and add if missing).

**Rationale:** Build artifacts should not be committed; the dist is regenerated on build.

## Risks / Trade-offs

- **[Dev-watch race] Shared rebuild vs backend recompile ordering** → In `pnpm -r --parallel run dev`, the backend's `nest start --watch` may attempt a compile before shared's `tsc --watch` emits the first build. Mitigation: backend `predev`/`prebuild` performs one synchronous shared build up front; subsequent shared edits trigger a shared re-emit and the backend watcher picks up the changed `dist/` on its next tick.
- **[Stale dist] Backend runs against outdated shared output if shared isn't rebuilt** → Mitigation: `prebuild` hook guarantees a fresh build on `pnpm build`; `dev` watch keeps it live. Document the workflow.
- **[Type drift] Shared `.d.ts` could lag source in non-watch flows** → Mitigation: `pnpm typecheck` builds shared first (prebuild); CI runs full `build` + `typecheck`.
- **[Frontend unaffected] Removing base `paths` must not break the frontend** → Verified: `apps/frontend/tsconfig.json` has its own `paths` override and Nuxt resolves via its bundler. No frontend change required.

## Migration Plan

1. Update `packages/shared/package.json` entry points → compiled `dist/`.
2. Remove `paths` from `tsconfig.base.json` and `apps/backend/tsconfig.json`.
3. Add `dev` (`tsc --watch`) and `prebuild` to the appropriate package scripts.
4. Delete stale `apps/backend/dist` (and `tsconfig.tsbuildinfo`) so the next build regenerates a flat tree.
5. Run `pnpm --filter @fuse/shared build` once, then `pnpm run dev:main` to confirm startup.
6. Verify `pnpm typecheck` and `pnpm lint` pass.

**Rollback:** Revert the four config/script changes. Note that rollback reintroduces the startup failure — this change is a fix, so rollback is only relevant if the fix itself is deemed unsuitable.
