---
source: src/modules/account/services/verification.ts
sha256: 21be670936d35c964ff0157a50fe73c3acd817db904ea948d0309f49a4f82a93
generated_at: 2026-09-23T18:10:42.853557+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/verification.ts

## Purpose

Centralises all email-verification token issuance and sending for two distinct flows: proving the address an account already has (signup / re-send) and proving the address a `PUT /account` change has requested (`pendingEmail`). Every flow that starts either verification calls this module so the two kinds cannot drift in token type, target address, or link route.

## Key elements

- **`EMAIL_VERIFY_TOKEN_TYPE`** (`'verify'`) / **`EMAIL_CHANGE_TOKEN_TYPE`** (`'email-change'`) — the two `tokens.type` strings; deliberately not members of the `TokenType` enum because they belong to account endpoints only.
- **`EMAIL_VERIFY_TOKEN_TTL_MS`** — token lifetime, read from `NODE_EMAIL_VERIFY_TTL_MS` (default 24 h) via `environmentNumber`.
- **`VERIFY_RESEND_SECONDS`** (60) — minimum interval between two verification emails for the same account.
- **`VERIFICATION_TARGETS`** — record mapping each token type to its frontend route (`'verify'` | `'email-change'`) and the address resolver (`user.email` vs `user.pendingEmail`).
- **`sendVerificationEmail(user, context, type?)`** — removes all prior tokens of the same kind, mints a fresh one, renders the localised email body, and enqueues it at **high** priority via `enqueueEmail`. Resolves when the job is queued, not when mail is delivered.
- **`requestEmailVerification(user, context)`** — wraps `sendVerificationEmail` and records an `AUTH_EMAIL_VERIFY_REQUESTED` audit entry; used only for the explicit user-initiated re-send.
- **`requestEmailVerificationFor(userId, context)`** — full `POST /account/verify-request` handler: loads the user with credentials, rejects 404 / 409 (already verified) / cooldown, then delegates to `requestEmailVerification` and returns a `ResponseSuccess` carrying `resendAfter`.
- **`markVerified(user)`** — stamps `verifiedAt` on the document and calls `promoteVerifiedCustomer`; intended to be passed as a `beforeSave` callback so the role write and the user save land in one transaction.
- **`completeEmailVerification(user, context)`** — persists the verified state via `userService.markEmailVerified`, promotes the role, reads roles for the audit actor, and records `AUTH_EMAIL_VERIFY_COMPLETED`.
- **`completeEmailChange`** (truncated in source) — analogous flow for spending an `EMAIL_CHANGE_TOKEN_TYPE` token.
- **`resendCooldownRemaining`** (private) — computes seconds-until-resend from the live token's `sentAt` using `cooldownRemaining`.

## Relationships

- **`@infrastructure/adapters/mailer`** — `enqueueEmail` publishes the verification mail job.
- **`@infrastructure/i18n`** — `t` and `getDefaultLocale` localise the email subject/body and error messages before the job is queued.
- **`@infrastructure/runtime/environment`** — `environmentNumber` reads the TTL from the environment.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP responses returned by `requestEmailVerificationFor`.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the verify-requested and verify-completed audit entries.
- **`../audit`** (`accountAuditActions`) — supplies the action enum values used in audit records.
- **`../cooldown`** — `cooldownRemaining` and `resendTooSoon` implement and format the per-account resend throttle.
- **`@modules/access`** — `promoteVerifiedCustomer` upgrades `unverified → customer`; `rolesOf` feeds the audit actor role.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` scopes the promotion and role lookups.
- **`@kernel/permissions`** — `isUnrestrictedRole` maps a tenant role to the audit `actor_role` string.
- **`./authentication`** — `tokenAdd` mints the token; `tokenRemoveAll` (via `userService`) clears stale ones.
- **`../emails`** — `verifyRequestEmail` renders the localised template for the given route.
- **`../controllers/post-signup`** — caller that triggers verification as a side-effect of signup (calls `sendVerificationEmail` directly, not through `requestEmailVerification`).

## Notes

- **Two token kinds, one mechanism.** `EMAIL_VERIFY_TOKEN_TYPE` proves `user.email`; `EMAIL_CHANGE_TOKEN_TYPE` proves `user.pendingEmail`. Spending one must never satisfy the other — a cross-type spend would be an account-takeover vector.
- **Old tokens of the same kind are removed before issuing a new one.** This is a UX guarantee ("the newest email is the one that works"), not a security measure.
- **Cooldown lives in the service, not only the route limiter.** `credentialLimiters` uses `skipSuccessfulRequests`, which would let a button that succeeds (and publishes mail) avoid spending budget. `requestEmailVerificationFor` enforces its own 60-second cooldown via the token's `sentAt`.
- **`markVerified` mutates the document without saving.** The caller is expected to persist it (e.g. as a `beforeSave` hook on `setPassword`). The role promotion inside is an independent membership write and must be awaited separately.
- **`completeEmailVerification` does NOT call `markVerified`.** It calls `userService.markEmailVerified` directly, which handles persist + promote in one step, avoiding a double-write.
- **The cooldown error code (`EMAIL_VERIFY_RESEND_TOO_SOON`) is module-private**, matching the convention in `services/two-factor.ts`: clients read the code off the response body rather than importing the constant.
