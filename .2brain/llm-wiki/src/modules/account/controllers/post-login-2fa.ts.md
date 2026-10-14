---
source: src/modules/account/controllers/post-login-2fa.ts
sha256: f3906b59da25d593a563468ed6f10b926426b5753d060a5599128bdf908e2a3e
generated_at: 2026-10-14T14:36:03.813021+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa.ts

## Purpose

HTTP handler for `POST /account/login/2fa`, the second step of a two-factor login. It validates the request body, resolves the pending 2FA challenge (from the body or an OAuth-originated cookie), delegates verification to the two-factor service, and—on success—issues a session with an `amr: ['pwd', 'otp']` proof array so downstream guards recognize the second factor as satisfied.

## Key elements

- **`postLoginTwoFactor`** (default and only export) – Express route handler. Parses the body with `LoginTwoFactorBody` (Zod), resolves the challenge, calls `twoFactorService.verifyLoginChallenge`, then chains `issueSession` → `isUnrestrictedCaller` → `rememberDevice` → `successResponse`. Emits `authTwoFactorChallengeTotal` on every terminal path.
- **Challenge resolution** – The challenge is taken from `request.body.challenge` when present; otherwise it falls back to `readMfaChallengeCookie(request)`, which covers the OAuth-redirect flow where the challenge was never sent to the client.
- **AMR / session proofs** – `withProofs(amr, AMR.otp)` appends the OTP factor to the session's `amr` array; this is what later `AMR` checks rely on.
- **`rememberDevice` / `destroyMfaChallengeCookie`** – Only called after a fully successful login; the device cookie is "baked in" at this step, and the one-time MFA cookie is removed.

## Relationships

- **`src/modules/account/services/index.ts`** – Imports `twoFactorService`; the only domain logic this controller delegates (challenge verification, code matching, factor type).
- **`src/modules/account/oauth/mfa-redirect.ts`** – Provides `readMfaChallengeCookie` / `destroyMfaChallengeCookie` for the OAuth-redirect 2FA path.
- **`src/modules/account/domain/session-proof.ts`** – Supplies `AMR.otp` and `withProofs` to build the session's attestation array.
- **`src/modules/account/roles.ts`** – `isUnrestrictedCaller(userId)` is queried post-session to record the correct tier in observability.
- **`src/modules/account/metrics.ts`** – `authTwoFactorChallengeTotal` counter is incremented on every success/failure branch.
- **`src/modules/account/session/device-cookie.ts`** – `rememberDevice` sets the "this browser is familiar" cookie exactly once, at final login completion.
- **`src/modules/account/session/config.ts`** – `toRememberTier` maps the client's `remember` flag to the internal tier enum passed to `issueSession`.
- **`src/infrastructure/http/controller.ts`** – `rejectValidation` (Zod parse failure) and `refused` (service-level rejection) shape early-exit responses.
- **`src/infrastructure/http/errors.ts`** – `rejectDatabaseError` handles the catch-all for unexpected throws.
- **`src/infrastructure/http/response.ts`** – `successResponse` / `rejectResponse` build the final JSON envelope.
- **`src/infrastructure/http/request.ts`** – `callerContextOf(request)` extracts caller metadata for the service call.
- **`src/infrastructure/i18n/context.ts` / `index.ts`** – `t()` localizes all user-facing error/success strings.

## Notes

- The controller intentionally contains **no factor-type logic**; whether the code is an OTP, TOTP, or backup code is entirely the service's concern. The controller just forwards `code` and `challenge`.
- `challenge` is **optional** in the Zod schema (`parseResult.data.challenge ?? …`), not required—this is what enables the OAuth cookie path.
- `rememberDevice` is called here (not in `postLogin`) because for a 2FA account the login is only *complete* after the second factor is verified; the device cookie is the "familiar browser" marker and must not be set earlier.
- The `isUnrestrictedCaller` lookup is a **fresh membership read** (the session document itself carries no role), so it is an async step nested inside the `issueSession` chain rather than a pre-check.
- Metrics are incremented in **every** terminal branch (validation failure, missing challenge, service refusal, success, catch) to keep the counter exhaustive.
