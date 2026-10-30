---
source: src/modules/account/controllers/post-reauth.ts
sha256: 34d8b62f21931310f4575230a2d0728662477a24c8354c6ec3742a6b78abc891
generated_at: 2026-10-29T02:31:54.228922+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reauth.ts

## Purpose

HTTP controller for `POST /account/reauth`. It is the server-side handler for a `401 REAUTH_REQUIRED` step-up challenge: the caller re-proves identity (password or emailed OTP code), and the session is re-minted with a fresh `auth_time` without being destroyed. It is a thin adapter over `accountService.reauth` plus a session re-issue.

## Key elements

- **`postReauth`** (exported) — The sole handler. Parses the body against the `ReauthBody` Zod schema, calls `accountService.reauth`, then calls `reissueSession` to produce new `AuthTokens`. Responds 200 on success, delegates errors to `rejectDatabaseError`.
- **`parseBody(ReauthBody, …)`** — Validates the request body; short-circuits with a 400 if invalid.
- **`refused(response, result)`** — Checks the service-level "refused" variant; if set, responds 4xx and stops.
- **`reissueSession(request, response, id, { amr })`** — Mints a new session token carrying only the `amr` proven by *this* call (e.g. `otp`), not any prior login claims.
- **`authReauthTotal.inc({ status })`** — Prometheus counter incremented on every outcome (`success` / `failure`).

## Relationships

- **`@infrastructure/http/controller`** — provides `parseBody` and `refused` helpers used for validation and service-level rejection.
- **`@infrastructure/http/response`** — provides `successResponse` for the 200 JSON reply.
- **`@infrastructure/http/errors`** — provides `rejectDatabaseError` for the `.catch` path.
- **`@infrastructure/http/request`** — provides `callerContextOf` to pass request context (IP, user-agent, etc.) into the service call.
- **`../services`** (`accountService`) — performs the actual credential verification; writes nothing and revokes no session itself.
- **`../session/session`** (`reissueSession`) — re-mints the session with the new `auth_time` and the `amr` from this call.
- **`../metrics`** (`authReauthTotal`) — records success/failure counts.
- **`../routes`** — registers this handler at the `POST /account/reauth` path (behind `isAuth` middleware).
- **`@types`** — imports `ReauthRequest` and `AuthTokens` type aliases.

## Notes

- **`amr` is not cumulative.** The reissued session's `amr` contains only what *this* call proved (e.g. `otp` for a code body). Nothing is carried over from the original login.
- **Re-issue failure = 500, not 200.** If `reissueSession` throws, the error propagates to the outer `.catch`. A 200 with no token would falsely signal the step-up challenge was cleared.
- **`accountService.reauth` is read-only.** It only compares the presented credential; the destructive/durable work (new session row) happens exclusively in `reissueSession`.
- **Auth context is assumed present.** `request.authContext!` uses a non-null assertion because the route is mounted behind `isAuth` middleware; a missing context is a wiring bug, not a runtime guard.
