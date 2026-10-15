---
source: src/modules/notifications/routes.ts
sha256: 801c2b4d8850556f12d93c295ca0ae5f18ad42c20025631f2b5f214004ef806c
generated_at: 2026-10-15T10:51:16.584630+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/routes.ts

## Purpose

Defines the Express route table for the notifications inbox (`/notifications`). It wires five endpoints to their controllers, applies the two permission keys (`read` and `delete`) per route, and places the SSE stream on a separate cookie-authenticated path ahead of the shared bearer chain.

## Key elements

- **`router`** (exported) — `express.Router` instance; the single public export of this file.
- **Route order** — Five routes are registered in a deliberate sequence:
  - `GET /stream` — SSE stream; uses `requireAllowedOrigin` + `requirePermissionViaCookie(NOTIFICATIONS_READ_KEY)`, declared **before** the `router.use(getAuth, isAuth)` line so it does not enter the bearer chain.
  - `GET /` — list notifications; bearer + `NOTIFICATIONS_READ_KEY`.
  - `POST /read-all` — mark all read; bearer + `NOTIFICATIONS_READ_KEY`.
  - `POST /dismiss-all` — remove all; bearer + `notifications.self.delete`.
  - `DELETE /:id` — remove one; bearer + `notifications.self.delete`.
- **`NOTIFICATIONS_READ_KEY`** — imported from `get-notifications-stream` controller; the single "read" permission key used by the stream, list, and read-all routes.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies all four auth middlewares (`getAuth`, `isAuth`, `requirePermission`, `requirePermissionViaCookie`) applied to every route.
- **`src/infrastructure/http/middlewares/origin.ts`** — supplies `requireAllowedOrigin`, applied only to the `/stream` route to block cross-origin `EventSource` connections.
- **`src/modules/notifications/controllers/get-notifications-stream.ts`** — provides the `getNotificationsStream` handler **and** the `NOTIFICATIONS_READ_KEY` constant.
- **`src/modules/notifications/controllers/get-notifications.ts`** — provides the `getNotifications` handler for `GET /`.
- **`src/modules/notifications/controllers/post-read-all.ts`** — provides the `postReadAll` handler.
- **`src/modules/notifications/controllers/post-dismiss-all.ts`** — provides the `postDismissAll` handler.
- **`src/modules/notifications/controllers/delete-notification.ts`** — provides the `deleteNotification` handler.
- **`src/modules/notifications/module.ts`** — consumer that mounts the exported `router` under `/notifications`.
- **`src/modules/notifications/tests/unit/routes.test.ts`** — unit tests exercising this route table.

## Notes

- **Order is load-bearing.** `/stream`, `/read-all`, and `/dismiss-all` are literal path segments that must be registered before `/:id`. If `/:id` came first, `DELETE /dismiss-all` would be parsed as an id.
- **Two auth paths coexist.** The stream authenticates via refresh cookie (no bearer token); everything below `router.use(getAuth, isAuth)` expects a bearer token. The stream is intentionally placed above that line.
- **`NOTIFICATIONS_READ_KEY` lives in the stream controller**, not in a dedicated constants file. Both `get-notifications.ts` and this routes file import it from there.
