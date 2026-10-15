---
source: src/modules/account/controllers/post-login-2fa.ts
sha256: 7f44db29a2626465cb58fd6be3f24c8e37a6b17647396ef753fd503185fc14c3
generated_at: 2026-10-15T09:55:05.300359+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa.ts

## Purpose

Controller for `POST /account/login/2fa`, the second step of a two-factor login. It validates the submitted code against the challenge issued by `POST /account/login`, then mints a full session (with `amr: ['pwd', 'otp']`) identical to a no-2FA login. It exists so the 2FA completion step can be routed independently and share the session-issuance path with `postLogin`.

## Key elements

- **`postLoginTwoFactor`** (exported) – The sole handler. Parses the body via `LoginTwoFactorBody` (Zod), resolves the challenge from the body or the MFA-challenge cookie, calls `twoFactorService.verifyLoginChallenge`, then chains `issueSession` → `recordLoginSuccess` → `rememberDevice` → `destroyMfaChallengeCookie` → `successResponse`. All paths (validation failure, service refusal, DB error) increment `authTwoFactorChallengeTotal` before responding.

## Relationships

- **`services/index.ts`** – Calls `twoFactorService.verifyLoginChallenge(challenge, code, callerContext)`; the service decides which factor (armed factor vs. backup code) the code belongs to.
- **`session/session.ts`** (via `issueSession`) – Mints tokens/cookies; receives `amr` (with `AMR.otp` proof), `provedAt`, `remember` tier, and `transport`.
- **`session-proof.ts`** – Provides `AMR.otp` constant and `withProofs()` to append the OTP proof to the inherited `pwd` AMR entry.
- **`oauth/mfa-redirect.ts`** – `readMfaChallengeCookie` recovers the challenge for OAuth-originated logins (where it was never sent in the body); `destroyMfaChallengeCookie` clears it on success.
- **`session/device-cookie.ts`** – `rememberDevice` is called *after* 2FA completes, not after the initial password step.
- **`session/config.ts`** – `toRememberTier` maps the client's `remember` flag to the tier passed to `issueSession`.
- **`session/login-observability.ts`** – `recordLoginSuccess` fires only after the session is issued.
- **`metrics.ts`** – `authTwoFactorChallengeTotal` (Prometheus counter) is incremented on every terminal path with `status: 'success' | 'failure'`.
- **`infrastructure/http/controller.ts`** – `rejectValidation` (Zod parse errors) and `refused` (service-level rejection) short-circuit the response.
- **`infrastructure/http/response.ts`** – `successResponse` / `rejectResponse` shape the final HTTP reply.
- **`infrastructure/http/errors.ts`** – `rejectDatabaseError` is the catch-all for unexpected failures.
- **`infrastructure/http/request.ts`** – `callerContextOf(request)` extracts IP/user-agent for the service's verification.
- **`infrastructure/i18n/index.ts`** – `t()` supplies all user-facing message strings.

## Notes

- **Challenge source is conditional:** password-originated logins carry the challenge in the JSON body; OAuth-originated logins store it in a cookie (`mfa-challenge`). The controller tries the body first, then the cookie. If neither yields a value, it returns 401.
- **`provedAt` is captured *before* the async `verifyLoginChallenge` call.** The doc comment explains that a password changed mid-flight must cause a refusal; the timestamp is what the service checks against.
- **AMR is an array, not a single value.** Downstream guards read `amr` to decide whether a second factor has already been satisfied. The controller relies on `withProofs` to merge `AMR.otp` into the existing `['pwd']` entry without overwriting.
- **Device familiarization is deferred to this step.** A browser that passed the password step is *not* yet "known" until 2FA succeeds, preventing an attacker from marking a device as remembered with only a valid password.
- **`refused(response, result)` is a boolean guard, not a throw.** The service returns a structured refusal (e.g. wrong code, expired challenge) and the helper writes the response and returns `true` so the chain stops without entering the `.catch` path.
