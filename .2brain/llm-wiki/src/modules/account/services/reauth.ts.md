---
source: src/modules/account/services/reauth.ts
sha256: 048be3763198ec4886504277d1b00baa61141b580f77e84afc420d1410f40dfb
generated_at: 2026-11-14T18:50:18.565027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reauth.ts

## Purpose

Implements the **decision layer** for step-up re-authentication (`POST /account/reauth`). Given an already-authenticated caller, it verifies that the caller still controls their account via either a password (password accounts) or a mailed one-time code (OAuth-only accounts), optionally verifies a second-factor OTP, and returns the AMR claims the new session should carry. It does **not** mint or refresh the session — that is the controller's responsibility.

## Key elements

- **`amrAfterReauth(method, otpProven)`** — Returns the AMR string array for a session after re-auth. Contains only what *this* re-auth proved; login-time AMR is intentionally dropped.
- **`ReauthProven`** — Interface handed to the controller: `{ amr: string[] }`.
- **`reauthMethods(userId)`** — `GET /account/reauth`. Returns the methods the account can currently use (password or email) in offer order.
- **`sendReauthCode(userId, method, context)`** — `POST /account/reauth/methods/{method}/send`. Cooldown-gated; mails a code, persists its digest via `accountUserService.armReauthCode`, and audits the event.
- **`reauth(userId, proof, context)`** — The main verification. Calls `proveMethod` → `proveOtp`, then audits. Returns `ReauthProven` or a 422 reject.
- **`methodsOf(user)`** *(internal)* — Derives available methods: `['password']` if a hash exists, `['email']` if verified + SMTP available, `[]` otherwise.
- **`passwordMatches`** *(internal)* — argon2id compare; always `false` for password-less accounts.
- **`codeMatches`** *(internal)* — Delegates to `verifyDeliveredCode` with `kind: 'reauth'`.
- **`proveMethod`** *(internal)* — Rejects a method the account doesn't have *before* any comparison (prevents cross-method oracle).
- **`proveOtp`** *(internal)* — Runs `proveSecondFactor` only if the primary method already passed; a missing `otp` field is not a failure.

## Relationships

- **`@infrastructure/security/password-hash`** — `verifyPassword` (argon2id) is the sole password comparison primitive.
- **`@infrastructure/http/response` / `errors`** — All returns are typed `ResponseSuccess`/`ResponseReject`; storage failures map through `rejectDatabaseEnvelope('auth', …)`.
- **`@infrastructure/i18n`** — `t()` provides user-facing rejection messages keyed per method.
- **`@infrastructure/observability/audit`** — `recordAudit` fires on both code-sent and reauth-complete (success and failure).
- **`../domain/session-proof`** — `AMR` constants (`password`, `email`, `otp`) define the vocabulary for session claims.
- **`../audit`** — `accountAuditActions` enum values for the two audit events.
- **`../emails`** — `reauthCodeEmail` template passed to the delivery pipeline.
- **`./caller`** — `withOwnAccount` resolves the user document and is the single entry point for every exported function.
- **`./two-factor-lockout`** — `proveSecondFactor` enforces the lockout/ceiling logic for the OTP half.
- **`./two-factor-outcomes`** — `tooSoon(wait)` builds the cooldown reject response.
- **`../two-factor/delivered-code-verify`** — `verifyDeliveredCode` performs the atomic spend-or-reject of the mailed code.
- **`../two-factor/methods/email`** — `deliverEmailCode` handles the actual SMTP queueing.
- **`src/modules/account/services/index.ts`** — Re-exports the public API for route controllers.
- **`src/modules/account/tests/unit/reauth-policy.test.ts`** — Unit tests for the AMR and method-selection policy.

## Notes

- **No dummy-compare.** Unlike `login`, this file never compares a dummy hash. The caller is already identified by their access token, so the timing-oracle concern doesn't apply.
- **AMR is reset, not accumulated.** `amrAfterReauth` returns *only* the current proof. A password-only re-auth will strip a previously-earned `otp`, so any route requiring `otp` will re-challenge. This is intentional and documented in the JSDoc.
- **`email` is not a registered RFC 8176 AMR value.** It is app-specific; `otp` *is* registered and is reserved for true second factors.
- **Delivery-before-write ordering.** `deliverCode` queues the mail *before* persisting the digest. If the queue rejects, nothing is armed — no orphaned code state.
- **Mongoose subdocument quirk.** After assigning `user.reauthCode = {}`, the code re-reads it back (`const slot = user.reauthCode`) because Mongoose hydrates the assignment into a subdocument; helpers must mutate *that* reference.
- **Cross-method refusal is pre-comparison.** `proveMethod` checks `methodsOf` before calling `passwordMatches` or `codeMatches`, so an attacker cannot use the response to learn which credential an account holds.
