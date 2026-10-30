---
source: src/modules/account/controllers/delete-session.ts
sha256: 88cd152c147a6f051fcde172eebc40c203611c954dbea61cb0d684a2ff953e3e
generated_at: 2026-10-29T02:26:17.621297+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-session.ts

## Purpose
HTTP controller for `DELETE /account/sessions/:sessionId`. It validates the `sessionId` param, delegates to `accountService.sessionRevoke`, and handles the HTTP response (including cookie cleanup when the revoked session is the caller's current one).

## Key elements
- **`deleteSession`** (exported) — The sole handler. Reads the authenticated user's `id` from `request.authContext`, validates `sessionId` via `requireId`, calls `accountService.sessionRevoke`, then either returns 204 (with optional cookie destruction) or a 404 reject.

## Relationships
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `sessionId` path param; on failure it sends the 404 and the handler returns early.
- **`src/infrastructure/http/response.ts`** — `noContentResponse` (204 success) and `rejectResponse` (404 failure) shape the HTTP reply.
- **`src/infrastructure/http/controller.ts`** — `catchAs` wraps the promise rejection path into a standard error response.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts request metadata (IP, user-agent, etc.) passed into `sessionRevoke`.
- **`src/infrastructure/i18n/index.ts`** — `t` resolves the `account.sessions.not-found` message for 404 bodies.
- **`src/modules/account/services/index.ts`** — `accountService.sessionRevoke` performs the actual revocation and returns `{ revoked, current }`.
- **`src/modules/account/session/cookies.ts`** — `destroySessionCookie` clears the session cookie when the revoked session is the caller's active one.
- **`src/modules/account/session/session.ts`** — `sessionCredentialOf` extracts the current session credential from the request for the service call.
- **`src/modules/account/routes.ts`** — Registers this handler on the `DELETE /account/sessions/:sessionId` route (behind `isAuth` middleware).

## Notes
- `request.authContext!` uses a non-null assertion; the `isAuth` middleware upstream is what guarantees it is populated. There is no guard in this file.
- A 404 is returned for three indistinguishable cases: the id doesn't belong to the caller, the id is a pending token (reset/delete/verify), and the id is malformed. This is intentional to avoid leaking which sessions exist.
- When `current` is `true`, the cookie is destroyed *before* `noContentResponse` sends the reply, so the `Set-Cookie` header is included in the 204.
- The handler is written as a promise chain (`.then().catch()`) rather than `async/await`, matching the project's controller convention.
