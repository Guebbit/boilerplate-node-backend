---
source: src/modules/account/services/reauth.ts
sha256: 9f92bfc4b68bf186c4f5c62c8ac6c94750c809ef607d7c20bdeda6309832bbf1
generated_at: 2026-11-08T04:22:07.326855+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reauth.ts

## Purpose

Implements step-up re-authentication for an already-signed-in caller: determines which proof methods an account supports, mails a one-time code for password-less (OAuth-only) accounts, and verifies either a typed password or a mailed code behind `POST /account/reauth`. It returns the AMR claims the *controller* uses to re-mint the session; it never mints the session itself.

## Key elements

- **`amrAfterReauth(method, otpProven)`** — builds the AMR array for the refreshed session. Only the current re-auth's proofs are included; login-time proofs are deliberately not carried over.
- **`ReauthProven`** (interface) — the success payload handed back to the controller: `{ amr: string[] }`.
- **`reauthMethods(userId)`** — `GET /account/reauth`. Returns the ordered list of methods the account can use right now (`password` or `email`, or empty).
- **`sendReauthCode(userId, method, context)`** — `POST /account/reauth/methods/{method}/send`. Enforces method availability and cooldown, queues the email, then persists the code digest. Records an audit event.
- **`reauth(userId, proof, context)`** — the verification half of `POST /account/reauth`. Proves the primary method, optionally proves a second-factor (`otp`) code, records an audit event, and returns `ReauthProven`.
- **`AMR_OF_METHOD`** — maps `password → AMR.password`, `email → AMR.email`. The `email` AMR is app-specific, not an RFC 8176 registered value.
- **Internal helpers** — `methodsOf`, `deliverCode`, `passwordMatches`, `codeMatches`, `proveMethod`, `proveOtp`, `rejectAuthFailure`.

## Relationships

- **`./caller.ts`** — every exported entry point wraps its user lookup in `withOwnAccount`, which resolves the caller's own `UserDocument` from the already-verified access token.
- **`./two-factor-lockout.ts`** — `proveOtp` delegates to `proveSecondFactor` when the body includes an `otp` field; a failed OTP attempt is counted against the shared two-factor lockout budget.
- **`./two-factor-outcomes.ts`** — `tooSoon(wait)` is returned when the delivery cooldown has not expired.
- **`../two-factor`** — `deliveryCooldownRemaining`, `twoFactorMethod`, `verifyDeliveredCode` provide cooldown timing, method availability, and atomic code verification.
- **`../two-factor/methods/email.ts`** — `deliverEmailCode` is called (with `reauthCodeEmail` as the template) to queue and send the step-up code.
- **`../emails.ts`** — supplies the `reauthCodeEmail` template used when mailing the code.
- **`../domain/session-proof.ts`** — provides the canonical `AMR` constants (`AMR.password`, `AMR.email`, `AMR.otp`) used in the returned claims.
- **`../audit.ts`** — supplies `accountAuditActions.AUTH_REAUTH_CODE_SENT` and `AUTH_REAUTHENTICATED` for the two audit records.
- **`@infrastructure/security/password-hash.ts`** — `verifyPassword` (argon2id) compares a typed password against the stored hash.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope('auth', …)` converts storage failures into the shared database error envelope instead of a bare 500.
- **`@infrastructure/i18n`** — `t()` resolves user-facing error messages (wrong-password, method-unavailable, no-password, wrong-code).
- **`@infrastructure/observability/audit.ts`** — `recordAudit` writes the audit log for both code-sent and re-auth-attempted events.
- **`services/index.ts`** — re-exports this module so controllers import from the barrel.
- **`tests/unit/reauth-policy.test.ts`** — unit-tests the policy decisions (method availability, AMR construction, rejection paths).

## Notes

- **Session re-minting is not done here.** The file returns AMR claims; `../session/session.ts` (the controller layer) is responsible for issuing a fresh session with a new `auth_time`. This mirrors the split `passwordChange` / `postPasswordChange` uses.
- **AMR is not cumulative.** A password-only re-auth that returns `['password']` will *not* retain an `otp` AMR from the original login, even if one existed. A route that demands `otp` must re-challenge.
- **`otp` in the body is optional.** Omitting it is a success (the session simply earns no `otp`); including it triggers `proveSecondFactor`, and a failure there rejects the whole call.
- **Method-availability guard precedes any comparison.** A password account is rejected for `method: 'email'` and vice-versa *before* the credential is checked, so the endpoint cannot be used to probe or mail unsolicited codes.
- **Email delivery is queued before the DB write.** If the mail queue refuses, nothing is persisted ("a queue that refuses leaves nothing armed"), matching the second-factor send pattern.
- **No dummy-compare for timing.** Unlike the anonymous login path, the caller is already authenticated, so the access token already identifies the account and a timing side-channel is not a concern.
- **The active / `deletedAt` gate is not re-checked here**; `isAuth` (upstream middleware) already enforced it for the request.
