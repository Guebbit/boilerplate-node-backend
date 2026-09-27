---
source: src/app/system-routes.ts
sha256: f21fab7d0dfeb78db3fc5983375fc014acbd11439da4f86f587c58904c4d3031
generated_at: 2026-09-27T14:03:19.088497+00:00
model: ollama:qwen3.8:27b
---

# src/app/system-routes.ts

## Purpose

Defines two system-level Express routes — a root ping and a Kubernetes readiness probe — that report process health rather than domain state. It is deliberately placed in `src/app/` (not `src/modules/`) so these endpoints have no business-logic owner.

## Key elements

- **`router`** (exported `express.Router`) — the route collection, mounted at `/` by the app entry point.
- **`GET /`** — public ping; responds with `{ status: 'ok' }` and HTTP 200 via `successResponse`.
- **`GET /readyz`** — readiness probe; returns a bare `200` or `503` with an **empty body**, based on `isServerReady()`.

## Relationships

- **`src/app/routes.ts`** — imports `router` from this file and mounts it at the `/` path.
- **`src/infrastructure/http/response.ts`** — provides the `successResponse` helper used by the ping route.
- **`src/infrastructure/runtime/readiness.ts`** — provides `isServerReady()` which the `/readyz` route calls to decide 200 vs 503.

## Notes

- `/readyz` intentionally skips the standard JSON envelope. The comment explains the contract: an orchestrator's probe reads only the status code, and omitting the body avoids allocating a response on an endpoint polled every few seconds for the container's entire lifetime.
- Both handlers ignore the incoming request object (`_request`), indicating neither depends on query params, headers, or body.
