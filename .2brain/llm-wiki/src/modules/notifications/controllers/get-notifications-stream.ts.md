---
source: src/modules/notifications/controllers/get-notifications-stream.ts
sha256: 629dd9311d665e07878e351fa54814333cb82b2eddf56576d7e95aec46fd13e1
generated_at: 2026-10-15T10:49:41.622618+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/get-notifications-stream.ts

## Purpose
Controller for `GET /notifications/stream`. Opens the caller's Server-Sent Events (SSE) stream and wires a periodic permission recheck to the same cookie that authenticated the initial request. Exists as a separate handler because SSE clients (`EventSource`) cannot send an `Authorization` header, so this route uses cookie-based auth rather than the standard bearer-token path.

## Key elements
- **`NOTIFICATIONS_READ_KEY`** (`'notifications.self.read'`) — Exported constant for the permission key this route guards on. Exported from this file (not from `routes.ts`) because the handler needs the string *value* for the recheck predicate, not merely a guard reference.
- **`getNotificationsStream`** — Request handler. Validates that `request.authContext` and `request.sessionRecheck` are present (set by the upstream `requirePermissionViaCookie` middleware); if either is missing, responds 401 via `rejectResponse`. Otherwise delegates to `streamNotifications(response, user.id, recheckFn)`.

## Relationships
- **`services/stream.ts` / `services/index.ts`** — Calls `streamNotifications`, which owns the actual SSE lifecycle (headers, heartbeat, teardown).
- **`kernel/middlewares/authorizations.ts`** — Imports `stillHoldsKeyViaCookie`, passed as the recheck predicate so the stream re-validates the cookie every 30 s.
- **`infrastructure/http/response.ts`** — Uses `rejectResponse` for the 401 early-return path.
- **`infrastructure/i18n/index.ts`** — Uses `t` to localise the 401 error message.
- **`routes.ts`** — Mounts this handler behind `requirePermissionViaCookie` but deliberately *not* behind `isAuth`.
- **`tests/unit/get-notifications-stream.test.ts`** — Unit-tests the handler's auth-check and delegation logic.

## Notes
- The route is intentionally outside `isAuth` (bearer-token guard). `request.authContext` / `request.sessionRecheck` are therefore read *without* a `!` assertion; absence is treated as fail-closed (401).
- The 30-second recheck cadence is configured inside `streamNotifications`; the controller only supplies the predicate (`stillHoldsKeyViaCookie(request, NOTIFICATIONS_READ_KEY)`).
- Do not move `NOTIFICATIONS_READ_KEY` into `routes.ts` — the handler needs the literal value at runtime, while `routes.ts` only needs it as a guard token.
