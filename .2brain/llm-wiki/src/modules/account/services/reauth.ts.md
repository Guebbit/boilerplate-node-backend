---
source: src/modules/account/services/reauth.ts
sha256: bbec75795b64aff1f1b612be5952aa3c3c176e933c7fc1ca213dc4b54da16d3c
generated_at: 2026-10-15T10:02:33.699314+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reauth.ts

## Purpose

Implements step-up re-authentication for an already-authenticated caller: determining which proof methods an account can use, mailing a one-time code for password-less (OAuth-only) accounts, and verifying the submitted proof (password or code, plus an optional second-factor code). It returns the `amr` claim the controller should stamp on the re-minted session; the session itself is re-minted by the controller, not here.

## Key elements

- **`amrAfterReauth(method, otpProven)`** – Computes the `amr` array for the new session. Includes the method's value (`password` or `email`) and appends `otp` only if a second-factor code was verified in the same call.
- **`ReauthProven`** (interface) – The success payload handed back to the controller: `{ amr: string[] }`.
- **`reauthMethods(userId)`** – `GET /account/reauth`. Returns the ordered list of methods the account can answer with (`['password']` or `['email']` or `[]`).
- **`sendReauthCode(userId, method, context)`** – `POST /account/reauth/methods/{method}/send`. Guards method availability and cooldown, then mails a code via `deliverEmailCode` and arms it in the DB. Audits the send.
- **`reauth(userId, proof, context)`** – Verification half of `POST /account/reauth`. Proves the named method (password hash compare or code match), optionally proves a second-factor code, audits the attempt, and returns `ReauthProven`.
- **`AMR_OF_METHOD`** – Maps each `ReauthMethod` to its RFC 8176 `amr` string.
- **Internal helpers** – `methodsOf`, `rejectAuthFailure`, `deliverCode`, `passwordMatches`, `codeMatches`, `proveMethod`, `proveOtp`.

## Relationships

- **`src/infrastructure/security/password-hash.ts`** – Calls `verifyPassword` (argon2id) to compare a submitted password against the stored hash.
- **`src/infrastructure/http/response.ts`** – Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types for all return values.
- **`src/infrastructure/http/errors.ts`** – `rejectAuthFailure` wraps unexpected errors in `rejectDatabaseEnvelope('auth', error)` so callers never see a bare 500.
- **`src/infrastructure/i18n/index.ts`** – `t()` provides localized user-facing error messages (wrong password, method unavailable, wrong code, etc.).
- **`src/infrastructure/observability/audit.ts`** – `recordAudit` logs `AUTH_REAUTH_CODE_SENT` and `AUTH_REAUTHENTICATED` events with outcome and method.
- **`src/modules/account/audit.ts`** – Supplies the `accountAuditActions` enum values used in those audit records.
- **`src/modules/account/domain/session-proof.ts`** – Exports the `AMR` constant (`AMR.password`, `AMR.email`, `AMR.otp`) used to build the post-reauth claim.
- **`src/modules/account/emails.ts`** – Provides `reauthCodeEmail`, the email template passed to `deliverEmailCode`.
- **`src/modules/account/services/caller.ts`** – `withOwnAccount` resolves the caller's user document and enforces the "own account" guard before any logic runs.
- **`src/modules/account/services/two-factor-lockout.ts`** – `proveSecondFactor` verifies the optional `otp` field and enforces the attempt ceiling.
- **`src/modules/account/services/two-factor-outcomes.ts`** – `tooSoon(wait)` builds the standard "cooldown not elapsed" reject response.
- **`src/modules/account/services/index.ts`** – Re-exports the public surface of this module for consumers.
- **`src/modules/account/tests/unit/reauth-policy.test.ts`** – Unit tests covering the re-auth decision logic.

## Notes

- **AMR is intentionally narrow.** After re-auth the session carries *only* what this call proved. Login-time proofs (e.g. an `otp` earned at sign-in) are dropped because `auth_time` is refreshed; a stale `otp` would let a password-only re-auth satisfy a route that demands a second factor.
- **`email` is an app-specific AMR value.** RFC 8176 permits context-specific values; here it distinguishes a mailed step-up code from `otp` (which is reserved for a true second factor).
- **Mail-before-write ordering.** `deliverCode` queues the email before persisting the code digest, so a queue rejection leaves no armed code in the database.
- **Mongoose subdocument hydration.** `deliverCode` assigns `user.reauthCode = {}` then re-reads it; the re-read subdocument is the one passed to `deliverEmailCode` for mutation. Skipping the re-read would let the helper write to a detached object.
- **No dummy-compare (unlike `login`).** The caller is already authenticated (access token verified upstream), so there is no anonymous-identity timing oracle to mask.
- **Missing `otp` is not a failure.** If `proof.otp` is `undefined`, `proveOtp` succeeds with an `amr` that simply omits `otp`; downstream routes that require `otp` will prompt again.
- **Method gating before comparison.** `proveMethod` rejects a method the account cannot use *before* any credential check, so a password account can never be passed with a mailed code and vice-versa.
