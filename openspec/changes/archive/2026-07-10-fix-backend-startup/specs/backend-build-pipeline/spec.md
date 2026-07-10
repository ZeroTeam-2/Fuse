## ADDED Requirements

### Requirement: Flat backend dist output
The backend build (`nest build` / `nest start --watch`) SHALL emit a flat output tree rooted at `apps/backend/dist/`, with the entry points at `dist/main.js` and `dist/worker.js`. TypeScript's computed `rootDir` SHALL NOT expand beyond the backend's own `src/` due to out-of-project source files being pulled into compilation.

#### Scenario: main entry point resolves
- **WHEN** the backend is compiled via `nest start --watch` (or `nest build`)
- **THEN** the compiled entry point exists at `apps/backend/dist/main.js` (not a nested `dist/apps/backend/src/main.js`)
- **AND** `node apps/backend/dist/main` starts the NestJS application without a `MODULE_NOT_FOUND` error

#### Scenario: worker entry point resolves
- **WHEN** the worker is compiled via `nest start --watch --entryFile worker`
- **THEN** the compiled entry point exists at `apps/backend/dist/worker.js`
- **AND** `node apps/backend/dist/worker` starts the worker process without a `MODULE_NOT_FOUND` error

### Requirement: Shared package resolves to compiled output
The `@fuse/shared` workspace package SHALL be consumed as compiled JavaScript. Its `package.json` entry points (`main`, `types`, `exports`) SHALL point at `dist/index.js` / `dist/index.d.ts`, and the backend build SHALL resolve `@fuse/shared` through the pnpm workspace symlink rather than inlining the shared package's TypeScript source via `tsconfig` `paths`.

#### Scenario: shared package entry points
- **WHEN** a consumer resolves `@fuse/shared`
- **THEN** Node loads `packages/shared/dist/index.js` (compiled CommonJS)
- **AND** TypeScript type-checking uses `packages/shared/dist/index.d.ts`

#### Scenario: shared source not inlined into backend dist
- **WHEN** the backend is compiled
- **THEN** no `dist/packages/shared/` directory appears in `apps/backend/dist/`
- **AND** the backend output contains only the backend's own compiled modules

### Requirement: Shared package build ordering
The `@fuse/shared` package MUST be built (or watched) before the backend and worker compile and run, so that `dist/` is present and up to date. The root and package-level scripts SHALL orchestrate this automatically so that `pnpm dev`, `pnpm build`, and the backend/worker dev scripts do not require manual pre-build steps.

#### Scenario: dev startup builds shared first
- **WHEN** a developer runs `pnpm dev` (or `pnpm run dev:main`)
- **THEN** `@fuse/shared` is built before the backend attempts to compile
- **AND** the backend starts successfully against the current shared output

#### Scenario: shared changes are picked up in watch mode
- **WHEN** a file in `packages/shared/src/` is modified during `pnpm dev`
- **THEN** the shared package is recompiled
- **AND** the backend recompiles/restarts against the updated shared output

### Requirement: Backend dev script types correctness preserved
Removing the `tsconfig` `paths` override from the backend SHALL NOT introduce TypeScript type errors. The backend `typecheck` (`tsc --noEmit`) SHALL pass, resolving `@fuse/shared` types through the workspace package's `types`/`exports` fields.

#### Scenario: typecheck passes after config change
- **WHEN** `pnpm --filter @fuse/backend run typecheck` is executed
- **THEN** it completes with zero errors
- **AND** all `@fuse/shared` imports resolve their types correctly
