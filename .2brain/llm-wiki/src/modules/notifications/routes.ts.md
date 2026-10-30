---
source: src/modules/notifications/routes.ts
sha256: 9a3681403e47c7934f90da43db3be660f229c52c01a5bb8306fe6c61bfd7414a
generated_at: 2026-10-29T04:29:52.092838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/routes.ts

## Purpose

Defines the Express router mounted at `/notifications`, wiring each HTTP method and path to its controller with the appropriate authentication and permission middleware. All routes are scoped to the authenticated caller (an inbox is personal); no route is public.

## Key elements

- **`router`** (exported `Router`) — the single public export; the module's route table.
- **`GET /stream`** — SSE endpoint for live notifications. Authenticated via cookie (`requirePermissionViaCookie('read', 'Notification')`) and origin-checked (`requireAllowedOrigin`). Sits *above* the shared bearer-auth chain because `EventSource` cannot send a bearer header.
- **`router.use(getAuth, isAuth)`** — shared middleware applied to every subsequent route; enforces a valid bearer token.
- **`GET /`** — list the caller's notifications (`read` permission).
- **`POST /read-all`** — mark all notifications as read (`read` permission; only mutates `readAt`, does not change membership).
- **`DELETE /`** — remove all notifications (`delete` permission; changes set membership).
- **`GET /:id`** — fetch a single notification by id (`read` permission). Placed after literal paths to avoid shadowing `/stream` or `/read-all`.
- **`DELETE /:id`** — remove a single notification by id (`delete` permission).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `requirePermission`, and `requirePermissionViaCookie`, the four auth/permission middleware used on every route.
- **`src/infrastructure/http/middlewares/origin.ts`** — supplies `requireAllowedOrigin`, applied only to the SSE stream to prevent cross-origin `EventSource` connections.
- **`src/modules/notifications/controllers/*`** (six files) — each controller is the terminal handler for one route; this file delegates all business logic to them.
- **`src/modules/notifications/module.ts`** — mounts `router` into the application's Express app at the `/notifications` prefix.
- **`src/modules/notifications/tests/unit/routes.test.ts`** — unit-tests the route table (path, method, middleware ordering, permission keys).

## Notes

- The SSE stream route is deliberately ordered **before** `router.use(getAuth, isAuth)`. If reordered below it, the bearer middleware would reject the cookie-only `EventSource` request.
- Two permission keys are declared for this module: `read` (list, stream, mark-read, get one) and `delete` (remove one or all). `read-all` uses `read` because it only sets a timestamp; `DELETE /` uses `delete` because it removes rows.
- `/:id` routes are registered last so Express matches literal segments (`/stream`, `/read-all`) first and does not interpret them as an `id` parameter.
