---
source: src/modules/notifications/controllers/get-notifications-stream.ts
sha256: 65b2fe74379f46cde863dfb68ceba6ef945cd5020434d8ba90f2bb8c13880444
generated_at: 2026-11-08T06:30:48.187021+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/get-notifications-stream.ts

## Purpose

Controller for `GET /notifications/stream`. It validates the caller's cookie-based session (SSE via `EventSource` cannot send an `Authorization` header) and then delegates the actual Server-Sent Events streaming to `notificationsService.stream`, passing a periodic re-check callback.

## Key elements

- **`getNotificationsStream(request, response)`** — Exported Express handler. Reads `request.authContext` and `request.sessionRecheck` (both set upstream by `requireSessionViaCookie`). If either is missing, responds `401` with an i18n error via `rejectResponse`. Otherwise calls `notificationsService.stream(response, user.id, recheckFn)` where `recheckFn` is a closure over `stillSignedInViaCookie(request)`.

## Relationships

- **`src/modules/notifications/routes.ts`** — Mounts this handler at the `/notifications/stream` route, behind the `requireSessionViaCookie` middleware (not `isAuth`).
- **`src/modules/notifications/services/index.ts`** — Provides `notificationsService.stream`, which owns the SSE lifecycle and calls the re-check callback every 30 s.
- **`src/kernel/middlewares/authorizations.ts`** — Supplies `stillSignedInViaCookie`, the predicate used to re-validate the session while the stream is open.
- **`src/infrastructure/http/response.ts`** — Supplies `rejectResponse` for the 401 failure path.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Supplies `t()` for the localized error message.
- **`src/modules/notifications/tests/unit/get-notifications-stream.test.ts`** — Unit tests covering the 401 path and the happy-path delegation.

## Notes

- The route is **deliberately not** behind `isAuth`; that middleware expects a bearer token which `EventSource` cannot send. Authentication is cookie-only.
- `request.authContext` and `request.sessionRecheck` are read without the `!` non-null assertion. This is a lint/convention constraint: a "controllers behind `isAuth`" rule forbids asserting those properties in handlers not guarded by `isAuth`. Missing values simply short-circuit to a 401 (fail-closed).
- The 30-second re-check cadence is configured inside `notificationsService.stream`, not here; this file only supplies the callback.
