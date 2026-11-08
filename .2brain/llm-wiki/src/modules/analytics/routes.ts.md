---
source: src/modules/analytics/routes.ts
sha256: 75ba3172381707d4153b150d28af3b557f054650d8bc83a0177ba0cb45cf5d85
generated_at: 2026-11-08T04:59:08.745933+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/routes.ts

## Purpose

Defines the single public write route for the analytics relay (`POST /analytics/events`). It exists to keep the module's HTTP surface in one place: one endpoint, one middleware, one controller, mounted on a shared Express `Router` that the module entry point registers on the app.

## Key elements

- **`router`** (exported `Router`) — the Express sub-router for analytics. Exposed so `module.ts` can mount it on the app.
- **`router.post('/events', getAuth, postAnalyticsEvent)`** — the sole route. Returns `204` regardless of whether the event was recorded. Accepts guests; `getAuth` is optional-pass (signed-in users get their id attached, guests proceed without one).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — imports `getAuth`, the shared auth middleware that optionally resolves a signed-in visitor's identity without blocking anonymous requests.
- **`src/modules/analytics/controllers/post-analytics-event.ts`** — imports `postAnalyticsEvent`, the controller that handles the actual event ingestion (recording, consent checks, no-op path).
- **`src/modules/analytics/module.ts`** — consumes the exported `router` to mount these routes under the module's path prefix on the Express app.

## Notes

- The route writes nothing at the route layer and performs no work without consent (per the module doc comment); the "burst brake" lives in `app/security.ts`, not here.
- `getAuth` is non-blocking for guests — do not assume a user object is present downstream; the controller must handle the absent-auth case.
- The `204` contract is uniform: callers cannot distinguish "recorded" from "dropped" via status code alone.
