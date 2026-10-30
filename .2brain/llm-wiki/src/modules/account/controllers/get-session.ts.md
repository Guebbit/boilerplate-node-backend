---
source: src/modules/account/controllers/get-session.ts
sha256: d8d5333fca96b450a51551d58cd7923de04c83f95ee177b2173ea7216dd0c205
generated_at: 2026-10-29T02:27:51.684478+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-session.ts

## Purpose

Thin HTTP adapter for `GET /account/sessions/:sessionId`. It validates the path parameter, delegates the actual lookup to `accountService.sessionGet`, and shapes the JSON response. It exists so that routing (`routes.ts`) stays declarative while this file owns the request/response lifecycle for the single-session endpoint.

## Key elements

- **`getSession(request, response)`** — The sole export. Reads the authenticated user's `id` from `request.authContext`, validates `sessionId` via `requireId`, calls `accountService.sessionGet(id, sessionId, request)`, and either sends a `successResponse<Session>` or a 404 `rejectResponse` (i18n key `account.sessions.not-found`). Errors are funnelled through `catchAs`.

## Relationships

- **`src/modules/account/routes.ts`** — Wires the `GET /account/sessions/:sessionId` route to `getSession`, gating it behind the `isAuth` middleware.
- **`src/modules/account/services/index.ts`** — Source of `accountService.sessionGet`, which performs the actual database/service lookup.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-to-response helper.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and validates a UUID-shaped path parameter.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` / `rejectResponse` envelope helpers.
- **`src/infrastructure/i18n/index.ts`** (re-exports `context.ts`) — Provides the `t` translation function used for the 404 message.
- **`src/types/index.ts`** — Defines the `Session` interface used as the response payload type.

## Notes

- All failure shapes (someone else's session, an ended session, a fabricated ID, a malformed ID) intentionally collapse to the **same 404** to avoid leaking which IDs exist.
- `request.authContext!` is a non-null assertion; the guarantee comes from the `isAuth` middleware declared in `routes.ts`, not from a runtime check in this file.
- If `requireId` fails, the function returns `Promise.resolve()` (a no-op) after `requireId` has already sent its own 400/404, so the service is never called.
