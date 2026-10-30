---
source: src/modules/account/services/reauth.ts
sha256: 9f92bfc4b68bf186c4f5c62c8ac6c94750c809ef607d7c20bdeda6309832bbf1
generated_at: 2026-10-29T02:43:58.963832+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reauth.ts

## Purpose

Implements step-up re-authentication for an already-signed-in account: deciding which proof methods (password or mailed email code) the account can use, verifying a submitted proof, optionally verifying a second-factor OTP, and returning the AMR values the new session should carry. It deliberately does **not** re-mint the session — that is the controller's job (`../session/session.ts`). This module only decides and reports.

## Key elements

- **`amrAfterReauth(method, otpProven)`** — Returns the `amr` string array for the post-reauth session. Contains only what *this* reauth proved; login-time factors are not carried over.
- **`ReauthProven`** — The success payload handed to the controller: `{ amr: string[] }`.
- **`reauthMethods(userId)`** — `GET /account/reauth` handler. Returns the ordered list of methods available to this account (`['password']` or `['email']`).
- **`sendReauthCode(userId, method, context)`** — `POST /…/send` handler. Validates the method is available and not in cooldown, then mails a step-up code via `deliverEmailCode` and arms it on the user document.
- **`reauth(userId, proof, context)`** — `POST /account/reauth` handler. Verifies the named method (password hash compare or delivered-code check), then optionally verifies an OTP, and returns the AMR set. Audits the attempt.
- **Internal:** `methodsOf`, `deliverCode`, `passwordMatches`, `codeMatches`, `proveMethod`, `proveOtp`, `rejectAuthFailure`.

## Relationships

- **`src/infrastructure/security/password-hash.ts`** — `verifyPassword` (argon2id) is called to compare a submitted password against the stored hash.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return value; the `ResponseSuccess` / `ResponseReject` types annotate all handler signatures.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope('auth', error)` is the shared fallback for storage failures (never a bare 500).
- **`src/infrastructure/i18n/index.ts`** / **`context.ts`** — `t()` localises every user-facing error string.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs `AUTH_REAUTH_CODE_SENT` and `AUTH_REAUTHENTICATED` events on both handlers.
- **`src/modules/account/audit.ts`** — Provides the `accountAuditActions` enum values used in those audit calls.
- **`src/modules/account/emails.ts`** — `reauthCodeEmail` is the template passed to `deliverEmailCode` when mailing the step-up code.
- **`src/modules/account/services/caller.ts`** — `withOwnAccount` wraps every exported handler; it loads the caller's own document and guards against cross-account access.
- **`src/modules/account/services/two-factor-lockout.ts`** — `proveSecondFactor` is called (in `proveOtp`) to verify an optional OTP after the primary method passes.
- **`src/modules/account/services/two-factor-outcomes.ts`** — `tooSoon` produces the standard cooldown-reject response when the delivery window hasn't elapsed.
- **`src/modules/account/domain/session-proof.ts`** — `AMR` constants (`AMR.password`, `AMR.email`, `AMR.otp`) define the RFC 8176 values stamped on the session.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this module's public API.
- **`src/modules/account/tests/unit/reauth-policy.test.ts`** — Unit tests covering the policy logic in this file.

## Notes

- **AMR is reset, not accumulated.** `amrAfterReauth` returns only the current proof. A password-only reauth that kept a stale `otp` would falsely satisfy routes demanding a second factor — so login-time AMR is deliberately dropped.
- **No dummy-compare (unlike `login`).** The access token already identifies the caller, so timing-based enumeration of "no such account" vs. "wrong password" is not a concern here.
- **Mail-before-write ordering.** `deliverCode` queues the email first, then arms the digest on the document. A queue refusal leaves nothing armed.
- **Mongoose subdocument quirk.** After `user.reauthCode = {}`, the code reads the hydrated subdocument back (`const slot = user.reauthCode`) so that helpers mutate the correct reference.
- **`email` is an app-specific AMR value**, not an RFC 8176 registered one. `otp` is reserved for a true second factor; a mailed step-up code does not earn it.
- **Active/deleted gate is not re-checked.** `isAuth` already ran for the request; this module trusts that invariant.
