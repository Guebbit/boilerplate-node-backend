---
source: src/modules/account/controllers/get-session-config.ts
sha256: a944251cbecedba2f438006fc4745a2df85898638297b4f1f4be90eda6da5dbc
generated_at: 2026-10-14T08:32:27.182931+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-session-config.ts

## Purpose

Express controller for the public `GET /account/session-config` endpoint. It tells a client which session mode the current deployment uses so the client can adapt at boot time rather than maintaining its own configuration switch.

## Key elements

- **`getSessionConfig`** (exported) — The sole route handler. Resolves a `SessionConfig` object (`{ mode: getSessionMode() }`) and sends it via `successResponse`. Any thrown error is funneled through `catchAs(response, 'getSessionConfig')`. The `Request` parameter is intentionally unused (prefixed `_`).

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which wraps the `SessionConfig` payload in the project's standard HTTP success envelope.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-to-response mapper used in the `.catch` branch.
- **`src/modules/account/routes.ts`** — The router that mounts `getSessionConfig` on the `GET /account/session-config` path.
- **`src/modules/account/session/config.ts`** — Source of `getSessionMode()`, the single value the endpoint actually returns.
- **`src/types/index.ts`** — Declares the `SessionConfig` interface used as the generic parameter of `successResponse`.

## Notes

- Uses the `Promise.resolve().then().catch()` idiom rather than `async/await`; the `.catch` fires specifically if `getSessionMode()` throws (e.g., unreadable configuration at runtime).
- The endpoint is public — no authentication middleware is applied here or in the route wiring.
- Adding a new field to the response means extending `SessionConfig` in `@types` and populating it in the `.then` body; the response envelope shape is governed by `successResponse`, not by this file.
