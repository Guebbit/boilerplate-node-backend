---
source: src/modules/account/controllers/delete-session.ts
sha256: c4a8c8d5e37ff898c0e17ee787d2913f1a6336affbdf660e05df85e3068d4101
generated_at: 2026-10-15T09:53:39.854414+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-session.ts

## Purpose

Thin Express controller for `DELETE /account/sessions/:sessionId`. It validates the `sessionId` path parameter, delegates to `accountService.sessionRevoke`, and handles the two response branches (revoked vs. not found). It exists so the HTTP layer stays a single, isolated adapter over the account service's session-revocation logic.

## Key elements

- **`deleteSession`** (exported) — Express handler `(request, response) => void | Promise<void>`.
  - Reads the authenticated user id from `request.authContext!` (set by upstream `isAuth` middleware).
  - Validates `sessionId` via `requireId`; short-circuits with a 404 if malformed.
  - Calls `accountService.sessionRevoke(userId, sessionId, sessionCredentialOf(request), callerContextOf(request))`.
  - On `revoked === false` → 404 with `account.sessions.not-found`.
  - On `current === true` → calls `destroySessionCookie(response)` before the 200.
  - Success → 200 with `account.sessions.revoked`.
  - Errors → funneled through `catchAs(response, 'deleteSession')`.

## Relationships

- **`@infrastructure/http/controller.ts`** — provides `catchAs`, the shared promise-catch-to-error-response helper.
- **`@infrastructure/http/ids.ts`** — provides `requireId`, which parses/validates the `:sessionId` param and emits the 404 early.
- **`@infrastructure/http/request.ts`** — provides `callerContextOf`, extracting IP/user-agent context for audit.
- **`@infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse` used for the two exit paths.
- **`@infrastructure/i18n`** (`context.ts`, `index.ts`) — provides `t()` for user-facing message keys.
- **`src/modules/account/routes.ts`** — registers `deleteSession` as the handler for the `DELETE /account/sessions/:sessionId` route (behind the `isAuth` middleware).
- **`src/modules/account/services/index.ts`** — exports `accountService`, whose `sessionRevoke` method performs the actual DB-level revocation and returns `{ revoked, current }`.
- **`src/modules/account/session/cookies.ts`** — provides `destroySessionCookie`, called only when the revoked session is the caller's current one.
- **`src/modules/account/session/session.ts`** — provides `sessionCredentialOf`, extracting the session credential from the request for service-layer verification.

## Notes

- `request.authContext!` uses a non-null assertion; the contract is that `isAuth` middleware (registered in `routes.ts`) guarantees it. There is no runtime guard in this file.
- All "not the caller's" cases — foreign session, pending reset/delete/verify token id, malformed id — collapse to the same 404 shape, deliberately avoiding an existence oracle.
- Revoking the **current** session is allowed and behaves identically to `POST /account/logout` (cookies destroyed). Revoking **another** device's session clears nothing server-side because those cookies live in that device's browser.
- The function returns `void` on the early `!sessionId` path and a `Promise<void>` on the main path; callers (Express) treat both the same.
