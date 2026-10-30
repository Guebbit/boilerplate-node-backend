---
source: src/modules/account/controllers/post-password-change.ts
sha256: f255149a0d90697f59da6e0983ed2d4ed04e7a89e9c2410018b06756957255c4
generated_at: 2026-10-29T02:31:18.335286+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-change.ts

## Purpose

Thin HTTP adapter for `POST /account/password`. Validates the request body, delegates the actual password change to `accountService.passwordChangeWithCurrent`, and re-issues the caller's own session token so the user is not signed out of the tab in which they typed the new password.

## Key elements

- **`postPasswordChange(request, response)`** — the sole export. Orchestrates: body parse → session snapshot → service call → re-mint → response.
- **`parseBody(ChangePasswordBody, …)`** — validates the three fields (`currentPassword`, `password`, `passwordConfirm`) against the Zod schema; short-circuits with a 4xx on failure.
- **`sessionSnapshotOf(request, id)`** — captured *before* the service call because the change revokes all sessions including the caller's; the snapshot is passed to `reissueSession` to continue the same session lineage.
- **`reissueSession(request, response, id, { amr: [AMR.password], snapshot })`** — mints a fresh session token tagged with the `AMR.password` assertion.
- **`authPasswordChangeTotal`** (from `../metrics`) — Prometheus counter incremented with `status: 'success' | 'failure'` on every terminal path.
- **`refused(response, result)`** — checks the service's domain-level rejection (e.g. wrong current password) and sends the appropriate error; if triggered, the flow ends.
- **`callerContextOf(request)`** — extracts IP/UA metadata passed into the service for audit logging.
- **`rejectDatabaseError(response, …)`** — final `.catch` handler; maps infrastructural errors to a safe 500.

## Relationships

- **`@infrastructure/adapters/logger`** — `logger.warn` is the only log statement; fires when the password change succeeded but the session re-mint threw.
- **`@infrastructure/http/controller`** — provides `parseBody` (Zod validation + 400 response) and `refused` (domain-rejection → error response).
- **`@infrastructure/http/errors`** — `rejectDatabaseError` is the last-resort error mapper in the outermost `.catch`.
- **`@infrastructure/http/request`** — `callerContextOf` reads IP/UA from the Express request for the service's audit trail.
- **`@infrastructure/http/response`** — `successResponse` sends the 200 JSON body (either the new `AuthTokens` or an empty object on re-mint failure).
- **`../domain/session-proof`** — `AMR.password` constant tags the re-issued session with a "password change" authentication method.
- **`../metrics`** — `authPasswordChangeTotal` counter.
- **`../routes.ts`** — the route table wires `POST /account/password` to this controller (behind `isAuth` middleware).
- **`../services/index.ts`** — `accountService.passwordChangeWithCurrent` performs the actual write + other-session revocation.
- **`../session/session`** — `sessionSnapshotOf` and `reissueSession` handle token continuation.
- **`@types`** — `ChangePasswordRequest` and `AuthTokens` shape the request/response payloads.

## Notes

- **Re-mint failure is not an error.** If `reissueSession` throws after the password write and session revocation have both committed, the controller still returns `200` with an empty token object. A 500 here would falsely tell the caller the password did *not* change. The only side effect of a re-mint failure is a `logger.warn` and the absence of a new token.
- **Session snapshot ordering matters.** `sessionSnapshotOf` is called *before* `passwordChangeWithCurrent` because the service revokes all sessions (including the caller's). The snapshot is the only way to continue the same session lineage after the revoke.
- **`request.authContext!` is non-null by contract** — guaranteed by the `isAuth` middleware registered in `routes.ts`; the `!` assertion is safe but would be a runtime crash if the route were ever un-gated.
