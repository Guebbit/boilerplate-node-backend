---
source: src/modules/notifications/routes.ts
sha256: 6f4452c8edf7f58f2ad1077a998cccd25e1ba1a08b9b41f0a598b66754c55be0
generated_at: 2026-11-08T06:32:53.689833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/routes.ts

## Purpose

Defines the Express router for all notification endpoints under `/notifications`. It wires each route to its controller and attaches the correct authentication middleware per route. The file exists to keep route ordering, auth strategy, and origin checks in one place, separated from controller logic.

## Key elements

- **`router`** (exported) — Express `Router` instance mounted at `/notifications`.
- **`GET /stream`** — SSE endpoint. Authenticated via `requireSessionViaCookie()` and gated by `requireAllowedOrigin` (no bearer auth).
- **`GET /`** — List the caller's notifications → `getNotifications`.
- **`POST /read-all`** — Mark all as read (moves `readAt`, does not delete) → `postReadAll`.
- **`DELETE /`** — Empty the inbox → `deleteNotifications`.
- **`GET /:id`** — Fetch a single notification → `getNotification`.
- **`DELETE /:id`** — Delete a single notification → `deleteNotification`.
- **`router.use(getAuth, isAuth)`** — Applied to all routes *after* `/stream`; establishes the bearer-token chain for the remaining five routes.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Supplies `getAuth`, `isAuth` (bearer chain) and `requireSessionViaCookie` (cookie-only auth for the stream).
- **`src/infrastructure/http/middlewares/origin.ts`** — Supplies `requireAllowedOrigin`, applied only to `/stream` to prevent cross-origin `EventSource` opens.
- **`src/modules/notifications/controllers/*`** — Each controller file exports the single handler that the corresponding route invokes.
- **`src/modules/notifications/module.ts`** — Declares this module's bindings and presumably mounts `router` onto the app.
- **`src/modules/notifications/tests/unit/routes.test.ts`** — Unit-tests the route table (method, path, middleware order).

## Notes

- **Route ordering matters.** `/stream` and `/read-all` are registered *before* `/:id` so the parameterized routes don't swallow them.
- **Auth split is intentional.** The stream sits *above* `router.use(getAuth, isAuth)` because `EventSource` cannot set an `Authorization` header; it relies solely on the session cookie. All other routes go through the standard bearer chain.
- **No permission rules are declared here.** Scoping to the caller's own notifications is enforced inside the service layer; the module declares no access-control policy.
- **POST vs DELETE semantics:** `read-all` is a POST (state change, no resource removed) while `DELETE /` removes rows. This is a deliberate REST distinction noted in the inline comment.
