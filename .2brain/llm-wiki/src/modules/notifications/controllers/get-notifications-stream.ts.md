---
source: src/modules/notifications/controllers/get-notifications-stream.ts
source_sha256: 57e23d860e4c61e3995da331d062bf2d5e73f9d018f6f467ae8116a9f7cb29c8
context_sha256: 443c246884d164fbe50f2566cb220e5308fefa0ef82f690b2904b32d1bd37a61
generated_at: 2026-11-22T05:53:12.337819+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/controllers/get-notifications-stream.ts

## Purpose
Express controller for `GET /notifications/stream`. It opens the caller's Server-Sent Events (SSE) stream and ties the stream's periodic permission recheck to the same refresh cookie that authenticated the request. Cookie auth is used because an `EventSource` cannot send an `Authorization` header.

## Key elements
- `getNotificationsStream(request, response)`: the only export.
  - Reads `request.authContext` and `request.sessionRecheck`. If either is missing, it responds `401` through `rejectResponse` with code `UNAUTHORIZED` and the localized message `generic.error-unauthorized`, then returns.
  - Otherwise it calls `notificationsService.stream(response, user.id, () => stillSignedInViaCookie(request))`.
  - The callback passed to `stream` is the recheck. Per the doc comment, it runs every 30 seconds while the stream is open.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: provides `stillSignedInViaCookie`, used as the recheck callback. The route is mounted behind `requireSessionViaCookie`, which sets `authContext` and `sessionRecheck`.
- `src/modules/notifications/services/index.ts`: provides `notificationsService`, whose `stream` method owns the stream itself.
- `src/infrastructure/http/response.ts`: provides `rejectResponse` for the 401 body.
- `src/infrastructure/i18n/index.ts`: provides `t`, which localizes the error message.
- `src/infrastructure/i18n/context.ts`: listed as a graph neighbor, but not directly used in this file.
- `src/modules/notifications/routes.ts`: mounts this controller on the route.
- `src/modules/notifications/tests/unit/get-notifications-stream.test.ts`: unit tests for this controller.

## Notes
- The route is deliberately not behind `isAuth`, because that guard expects a bearer token. As a result, `authContext` and `sessionRecheck` are read without non-null assertions (`!`). The "controllers behind isAuth" check forbids asserting them, so a missing value fails closed with a 401.
- Docs: the file's header comment points to the `#the-pipeline` section of the notifications module documentation.
