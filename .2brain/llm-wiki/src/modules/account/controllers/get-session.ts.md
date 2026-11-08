---
source: src/modules/account/controllers/get-session.ts
sha256: d8d5333fca96b450a51551d58cd7923de04c83f95ee177b2173ea7216dd0c205
generated_at: 2026-11-08T04:02:46.596846+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-session.ts

## Purpose
Thin HTTP adapter that handles `GET /account/sessions/:sessionId`, delegating to `accountService.sessionGet` and mapping the result (or its absence) to a `200` or `404` response. It exists so the route layer stays declarative while validation, authorization context, and response shaping live in one small function.

## Key elements
- **`getSession`** (exported) — The sole export. Reads `request.authContext.id` (set upstream by the `isAuth` middleware), validates the `:sessionId` path param via `requireId`, calls `accountService.sessionGet(id, sessionId, request)`, and responds with `successResponse<Session>` or a `404` + i18n message. Errors are funneled through `catchAs`.

## Relationships
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to parse and validate the `sessionId` route parameter; returns early with a `404` if the value is malformed or missing.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` (200 body) and `rejectResponse` (404 body) to shape the HTTP reply.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` as the `.catch` handler to normalize unexpected errors into a consistent error response.
- **`src/infrastructure/i18n/index.ts`** — Imports `t` to translate the `account.sessions.not-found` key in both the `requireId` failure path and the service-level 404.
- **`src/modules/account/services/index.ts`** — Imports `accountService`; calls `.sessionGet(userId, sessionId, request)` which either resolves to a `Session` object or to `null`.
- **`src/types/index.ts`** — Imports the `Session` type used as the generic parameter for `successResponse`.
- **`src/modules/account/routes.ts`** — Upstream consumer; wires the `GET /account/sessions/:sessionId` route to this controller (and applies the `isAuth` middleware that populates `request.authContext`).

## Notes
- **Uniform 404 semantics.** A foreign session id, an ended session, a fabricated id, and a malformed id all produce the same `404` — intentionally indistinguishable to avoid leaking existence information.
- **Auth context is non-null asserted.** `request.authContext!` relies on `isAuth` middleware running first; there is no runtime guard here.
- **Early-return style.** When `requireId` fails the function returns `Promise.resolve()` (not `undefined`) so the route handler can safely `await` the controller.
- **i18n key used in two places.** The same `account.sessions.not-found` key is passed to both `requireId` (param-level) and the post-service 404, keeping the user-facing message consistent regardless of which layer rejects.
