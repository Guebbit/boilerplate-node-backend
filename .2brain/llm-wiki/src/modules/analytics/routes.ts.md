---
source: src/modules/analytics/routes.ts
sha256: 75ba3172381707d4153b150d28af3b557f054650d8bc83a0177ba0cb45cf5d85
generated_at: 2026-10-14T14:55:17.579455+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/routes.ts

## Purpose

Defines the Express route table for the analytics relay. It exposes a single public `POST /analytics/events` endpoint for recording one browsing event. The route is intentionally open to guests; authentication is optional and only serves to attach a signed-in visitor's id when present.

## Key elements

- **`router`** (export) — The sole export. An Express `Router` instance with one registered route.
- **`POST /events`** — The only route. Pipeline: `getAuth` middleware → `postAnalyticsEvent` controller. Responds `204` whether or not the event was actually recorded.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Supplies `getAuth`, the middleware that runs before the handler to optionally resolve a signed-in visitor's identity.
- **`src/modules/analytics/controllers/post-analytics-event.ts`** — Supplies `postAnalyticsEvent`, the handler that performs the actual event write (or no-op).
- **`src/modules/analytics/module.ts`** — Consumes this file's `router` export to mount the analytics endpoints on the application.

## Notes

- `getAuth` is applied to a guest-accessible route; it is *not* an auth gate. It runs purely to enrich the event context with a user id when a session exists, and does not reject anonymous requests.
- The module docstring references a global burst brake in `app/security.ts`. That file is **not** imported here; the brake is expected to be applied at a higher (app-level) layer.
- The route always returns `204 No Content`. Consumers should not expect a body or a success/failure distinction from the status code alone.
