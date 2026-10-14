---
source: src/modules/account/services/reauth.ts
sha256: ce509dd8dca922608aeefa240b5a501891bdd2423caa6a3cfc55f3b84ba14775
generated_at: 2026-10-14T08:52:20.568131+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reauth.ts

## Purpose

Implements step-up re-authentication for an already-signed-in caller: deciding which proof methods an account can use, mailing a one-time code to a password-less account, and verifying the proof behind `POST /account/reauth`. It deliberately stops at returning the earned `amr` values; re-minting the session (a fresh `auth_time`) is the controller's job.

## Key elements

- **`amrAfterReauth(method, otpProven)`** – Computes the `amr` array the session earns from *this* re-auth only (primary method ± `otp`). Login-time proofs are intentionally not carried forward.
- **`ReauthProven`** – Narrow interface (`{ amr: string[] }`) handed back to the controller on success.
- **`reauthMethods(userId)`** – Handler for `GET /account/reauth`; returns the ordered list of methods the account can use right now (`['password']`, `['email']`, or `[]`).
- **`sendReauthCode(userId, method, context)`** – Handler for `POST /account/reauth/methods/{method}/send`; enforces method availability and a resend cooldown, then mints a code, mails it, and persists its digest. Audits the attempt.
- **`reauth(userId, proof, context)`** – Handler for `POST /account/reauth`; verifies the primary method (password or code), optionally verifies a second-factor `otp`, audits the attempt, and returns `ReauthProven`.
- **`methodsOf(user)`** (private) – Resolves available methods from the user document: password if set, otherwise email if the address is verified *and* the deployment can deliver mail.
- **`withCaller(userId, action)`** (private) – Loads the user with `select:false` credentials; 401 on a vanished token, DB-envelope reject on infrastructure failure.
- **`deliverCode(user, context)`** (private) – Generates the code, arms the in-memory slot, queues the mail, then persists the digest. Mail is queued *before* the write so a refused queue arms nothing.
- **`proveMethod` / `proveOtp`** (private) – Split the verification: primary proof must pass before the optional `otp` is even evaluated.

## Relationships

- **`@infrastructure/security/password-hash`** – `verifyPassword` (argon2id) for the password path.
- **`@infrastructure/i18n`** – `t()` for all user-facing error/copy strings.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` for the response envelope.
- **`@infrastructure/http/errors`** – `rejectDatabaseEnvelope` to wrap Mongoose/database failures.
- **`@infrastructure/observability/audit`** – `recordAudit` after `sendReauthCode` and `reauth`.
- **`../audit`** – `accountAuditActions` enum values for the audit log.
- **`../emails`** – `reauthCodeEmail`, `recipientLocale`, `greetableName` to compose and localise the code email.
- **`../cooldown`** – `resendTooSoon` / `cooldownRemaining` to rate-limit code resends.
- **`../two-factor`** – `generateDeliveredCode`, `armDeliveredCode`, `verifyDeliveredCode`, `twoFactorMethod`, `DELIVERED_CODE_TTL_MS`, `DELIVERED_CODE_RESEND_SECONDS`.
- **`../two-factor/methods/email`** – `maskEmail` for the `sentTo` field in the response.
- **`./mail`** – `sendAccountMail` to queue the outbound message.
- **`./two-factor-lockout`** – `proveSecondFactor` for the optional `otp` verification.
- **`../domain/session-proof`** – `AMR` constants (`AMR.password`, `AMR.email`, `AMR.otp`) used by `amrAfterReauth`.
- **`services/index.ts`** – Barrel re-export; this file is the implementation behind those exports.

## Notes

- **AMR is reset, not accumulated.** A re-auth earns only what it proved *this* time. A password-only re-auth will *not* carry `otp` from the original login, preventing a route that demands a second factor from being satisfied by a stale proof.
- **`email` AMR is app-specific.** It is not a registered RFC 8176 value; the code comment notes that `otp` in this codebase means a true second factor, which a mailed step-up code is not.
- **No dummy-compare.** Unlike the login path (which fakes a hash check to mask "account not found"), the caller is already identified by their access token, so no timing oracles to hide.
- **`proof.otp === undefined` is success, not failure.** The session simply earns no `otp`; a downstream route that requires one will ask again.
- **Mail-before-write ordering.** `sendAccountMail` is awaited before `userService.armReauthCode`; a queue rejection therefore leaves no armed code in the DB.
- **Mongoose subdocument gotcha.** `user.reauthCode = {}` followed by `user.reauthCode` re-read is required so helpers mutate the hydrated subdocument, not the raw assigned object.
