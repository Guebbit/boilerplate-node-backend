---
source: src/modules/account/controllers/post-login-2fa.ts
sha256: 597dd5f022b5778242d7f99bfe1b0df428360bfc854c98cab85780700de440c3
generated_at: 2026-09-27T14:24:45.052278+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa.ts

## Purpose
HTTP adapter for `POST /account/login/2fa` — the second step of a two-factor login. It validates the request, resolves the pending challenge (from the body or an OAuth-originated cookie), delegates code verification to the two-factor service, and on success mints a session with `amr: [...amr, 'otp']` so downstream guards can see a second factor was satisfied.

## Key elements
- **`postLoginTwoFactor`** (exported) — The sole handler. Accepts an Express `Request`/`Response`, parses the body with `LoginTwoFactorBody`, resolves the `challenge` field (body value or `readMfaChallengeCookie` fallback), calls `twoFactorService.verifyLoginChallenge`, then calls `issueSession` with an appended `'otp'` AMR entry, records metrics/observability, destroys the MFA challenge cookie, and returns `{ token }` (200) or an error response.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` (bad body) and `refused` (service-level denial) used to short-circuit error paths.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` catches unexpected async errors in the `.catch` block.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts caller metadata (IP, user-agent, etc.) passed into the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` shape the HTTP reply.
- **`src/infrastructure/i18n/context.ts` / `index.ts`** — `t` supplies localised error strings (e.g. `account.two-factor.challenge-invalid`).
- **`src/modules/account/services/index.ts`** — `twoFactorService.verifyLoginChallenge` performs the actual code/backup-code check.
- **`src/modules/account/session/session.ts`** — `issueSession` creates the token and session record with the extended AMR array.
- **`src/modules/account/session/login-observability.ts`** — `recordLoginSuccess` logs the successful login event.
- **`src/modules/account/metrics.ts`** — `authTwoFactorChallengeTotal` incremented on every success/failure branch.
- **`src/modules/account/roles.ts`** — `isUnrestrictedCaller` checks membership-based role after the session is issued (used only for the observability record).
- **`src/modules/account/oauth/mfa-redirect.ts`** — `readMfaChallengeCookie` / `destroyMfaChallengeCookie` handle the OAuth-originated challenge that was never sent to the client in a response body.
- **`src/types/index.ts`** — `LoginTwoFactorRequest`, `AuthTokens` type imports.
- **`src/modules/account/routes.ts`** — Registers this handler at the `POST /account/login/2fa` route.

## Notes
- The `challenge` field is **optional** in the request body. When the 2FA challenge originated from an OAuth redirect flow it was stored in a cookie (never exposed to the client); the controller falls back to `readMfaChallengeCookie`. A missing challenge from both sources is a 401, not a 400.
- The AMR array is built as `[...amr, 'otp']` — the service returns the existing AMR entries (e.g. `['pwd']`) and this controller appends the OTP marker. Downstream role/permission guards read this array to confirm a second factor was satisfied.
- `isUnrestrictedCaller` is called **after** the session is issued solely to enrich the `recordLoginSuccess` observability event; it does not gate the response.
- The handler is synchronous in signature (returns a Promise implicitly) and relies on the `.then`/`.catch` chain rather than `async/await`.
