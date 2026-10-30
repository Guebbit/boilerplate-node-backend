---
source: src/modules/notifications/controllers/get-notifications-stream.ts
sha256: d575984b360e28c354992c792a93aa65cec188cc79aeb0a6a50a57f202d21731
generated_at: 2026-10-29T04:27:56.457955+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/get-notifications-stream.ts

## Purpose

Controller for `GET /notifications/stream`. It validates that the caller was authenticated via the refresh cookie (since `EventSource` cannot send an `Authorization` header) and then delegates to the notifications service to open a Server-Sent Events stream for that user's notifications.

## Key elements

- **`getNotificationsStream`** (exported function) — Express handler. Reads `request.authContext` and `request.sessionRecheck` (both set upstream by `requirePermissionViaCookie`), returns a `401` with an i18n message if either is missing, otherwise calls `notificationsService.stream(response, user.id, recheckFn)`.

## Relationships

- **`src/modules/notifications/routes.ts`** — mounts this handler on the `GET /notifications/stream` route behind `requirePermissionViaCookie` (not behind `isAuth`).
- **`src/modules/notifications/services/index.ts`** — provides `notificationsService`, whose `.stream()` method performs the actual SSE setup and periodic permission recheck.
- **`src/kernel/middlewares/authorizations.ts`** — supplies `stillHoldsRuleViaCookie`, the recheck callback passed into the service so the stream can be revoked if the cookie's permission lapses.
- **`src/infrastructure/http/response.ts`** — supplies `rejectResponse` for the `401` failure path.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — supplies `t()` for the localized error message.
- **`src/modules/notifications/tests/unit/get-notifications-stream.test.ts`** — unit tests exercising the controller's auth-check and delegation logic.

## Notes

- The route is **deliberately not** behind `isAuth` (which expects a bearer token). Consequently the code reads `request.authContext` and `request.sessionRecheck` without non-null assertions and treats their absence as a fail-closed `401`.
- The 30-second recheck interval is configured inside `services/stream.ts`, not here; this file only supplies the predicate (`stillHoldsRuleViaCookie(request, 'read', 'Notification')`).
- The `request` object is captured in the recheck closure, so the original cookie/session state at stream-open time is what's re-validated each tick.
