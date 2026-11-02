# backend-build-pipeline — delta

## MODIFIED Requirements

### Requirement: Flat backend dist output

The backend build (`nest build` / `nest start --watch`) SHALL emit a flat output tree rooted at `apps/backend/dist/`, with two entry points: `dist/main.js` (API process: HTTP + WebSocket gateways, no SQS consumer) and `dist/worker-main.js` (worker process: SQS consumer in a NestJS application context without an HTTP server). Both entry points SHALL be produced by the single existing build invocation — no separate build step or second compilation pass is required for production output. TypeScript's computed `rootDir` SHALL NOT expand beyond the backend's own `src/` due to out-of-project source files being pulled into compilation.

#### Scenario: main entry point resolves

- **WHEN** the backend is compiled via `nest start --watch` (or `nest build`)
- **THEN** the compiled entry point exists at `apps/backend/dist/main.js` (not a nested `dist/apps/backend/src/main.js`)
- **AND** `node apps/backend/dist/main` starts the NestJS application (API + WebSocket gateways) without a `MODULE_NOT_FOUND` error and without starting the SQS consumer

#### Scenario: worker entry point resolves

- **WHEN** the backend is compiled via `nest build`
- **THEN** the compiled entry point exists at `apps/backend/dist/worker-main.js`
- **AND** `node apps/backend/dist/worker-main` starts the worker application context (SQS consumer, no HTTP listener) without a `MODULE_NOT_FOUND` error

#### Scenario: single production image serves both processes

- **WHEN** the backend Docker image is built once from `apps/backend/Dockerfile`
- **THEN** the same image can be started as the API (`node apps/backend/dist/main`) or as a worker (`node apps/backend/dist/worker-main`) by changing only the container command
