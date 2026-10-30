---
source: src/modules/account/controllers/post-login-restore.ts
sha256: 073d382ccac0a56f6cf206c00cfc6320f86bf15a33f63f7938d815cdd1bfa321
generated_at: 2026-10-29T02:30:20.452165+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-restore.ts

## Purpose

Implements the `POST /account/login/restore` handler, the final step of signing in an account that is inside the grace period of its own deletion. It redeems the deletion challenge (cancelling the pending deletion) and then mints a session in the same manner as the standard `postLogin` flow.

## Key elements

- **`postLoginRestore`** (exported function) — The sole handler. Parses the request body against `LoginRestoreBody`, resolves the deletion challenge (body field or cookie), calls `accountService.restoreAtSignIn`, then issues a session, records observability, cleans up the challenge cookie, and returns `AuthTokens`.
- **Challenge resolution** — Falls back to `readDeletionChallengeCookie` when the body omits `challenge` (the OAuth sign-in path). A missing challenge yields a `401` with an i18n error.
- **`provedAt` capture** — A `Date.now()` snapshot taken *before* the service call; passed into `issueSession` so a password changed concurrently with the restore is detected and the login refused.

## Relationships

- **`src/modules/account/services/index.ts`** — Calls `accountService.restoreAtSignIn(challenge, callerContext)` to redeem the challenge and return `{ user, amr }`.
- **`src/modules/account/session/session.ts`** — Calls `issueSession` to mint the session with `remember`, `amr`, `provedAt`, and `transport`.
- **`src/modules/account/session/device-cookie.ts`** — Calls `rememberDevice` after a successful login.
- **`src/modules/account/session/login-observability.ts`** — Calls `recordLoginSuccess` for metrics/logging.
- **`src/modules/account/oauth/deletion-redirect.ts`** — Reads and destroys the deletion-challenge cookie (the OAuth transport for the challenge).
- **`src/modules/account/routes.ts`** — Registers this handler at `POST /account/login/restore`.
- **`src/infrastructure/http/controller.ts`** — Uses `parseBody` (Zod validation) and `refused` (standard rejection check).
- **`src/infrastructure/http/response.ts`** — Emits `successResponse` / `rejectResponse`.
- **`src/infrastructure/http/errors.ts`** — Routes unexpected errors through `rejectDatabaseError`.
- **`src/infrastructure/http/request.ts`** — Extracts caller context via `callerContextOf`.
- **`src/infrastructure/i18n/index.ts`** — Localises the "challenge-invalid" error message via `t`.
- **`src/types/index.ts`** — Imports `AuthTokens` and `LoginRestoreRequest` types.

## Notes

- The `provedAt` timestamp is intentionally captured *before* the async `restoreAtSignIn` call. If the service takes non-trivial time (e.g., a changed-password check), a stale `provedAt` causes `issueSession` to reject the login — this is a deliberate race guard, not a bug.
- When `parsed.challenge` is undefined the handler relies entirely on the deletion-challenge cookie set by the OAuth redirect flow; the cookie is destroyed only on success, so a failed restore leaves it intact for retry.
- The response on success is a `200` with `AuthTokens` in the body, matching the shape of the normal `postLogin` response so clients can treat both paths identically.
