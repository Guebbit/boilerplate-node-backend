---
source: src/modules/account/services/verification.ts
sha256: 4291547bbadbbae5e8562a85548acfbfff77baa191adeef2881f6d4cab0f86eb
generated_at: 2026-09-27T14:31:54.539674+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/verification.ts

## Purpose

Centralises email-verification token issuance and mail dispatch for two distinct flows that must not drift: proving the address an account already has (signup, explicit re-send) and proving the address a `PUT/PATCH /account` change has requested (`pendingEmail`). Every flow that starts either kind calls this module and nothing else.

## Key elements

- **`EMAIL_VERIFY_TOKEN_TYPE`** (`'verify'`) — token type for proving the account's existing email address. Deliberately a string, not a `TokenType` enum member; the JWT layer's enum does not know about it.
- **`EMAIL_CHANGE_TOKEN_TYPE`** (`'email-change'`) — token type for proving a *pending* email change. Kept distinct so a signup-verify token can never be spent to swap in a `pendingEmail`.
- **`VERIFY_RESEND_SECONDS`** (60) — minimum interval between two verification emails for one account; returned to the client as the resend countdown.
- **`sendVerificationEmail(user, context, type?)`** — core primitive: removes all existing tokens of the given kind, mints a new one, composes the i18n email (resolved to the recipient's locale before the job is published), and queues it via `sendAccountMail`. Returns when the job is enqueued, not when the mail is delivered.
- **`requestEmailVerification(user, context)`** — thin wrapper around `sendVerificationEmail` that additionally records an `AUTH_EMAIL_VERIFY_REQUESTED` audit event. Used only for the explicit re-send path.
- **`requestEmailVerificationFor(userId, context)`** — end-to-end handler for `POST /account/verify-request`. Loads the caller's account with credentials, rejects 404 / 409 (already verified) / cooldown-too-soon, then delegates to `requestEmailVerification`.
- **`markVerified(user)`** — stamps `verifiedAt` and calls `promoteVerifiedCustomer` to move `unverified → customer`. Intended as a `beforeSave` hook so the document save and the membership write land in the same request.
- **`completeEmailVerification`** (truncated in source) — spends a previously-located verification token and finalises the verify flow.
- **`auditProvenAddress`** (module-private) — records an audit event after any address proof, reading the caller's role fresh so `actor_role` reflects post-promotion state.
- **`VERIFICATION_TARGETS`** (module-private) — maps each token type to its frontend route and the user field that supplies the recipient address, keeping type and target in one lookup.
- **`resendCooldownRemaining`** (module-private) — computes seconds left on the 60 s resend window using the live token's `sentAt`.
- **`VERIFY_RESEND_TOO_SOON_CODE`** (module-private) — the 429 error code a client branches on to render a countdown; intentionally not exported.

## Relationships

- **`src/infrastructure/http/response.ts`** — imports `generateSuccess`, `generateReject`, and the `ResponseSuccess` / `ResponseReject` types to build the API responses in `requestEmailVerificationFor`.
- **`src/infrastructure/i18n/index.ts`** — imports `t` to resolve all user-facing strings (not-found, already-verified, resend-too-soon, email-sent).
- **`src/infrastructure/observability/audit.ts`** — imports `recordAudit` and `AuditAction` for the verification-request and address-proven audit events.
- **`src/infrastructure/runtime/environment.ts`** — imports `environmentNumber` to read `NODE_EMAIL_VERIFY_TTL_MS` (default 24 h).
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID`, passed to `promoteVerifiedCustomer` in `markVerified`.
- **`src/modules/access/index.ts`** — imports `promoteVerifiedCustomer`; the role promotion half of `markVerified`.
- **`src/modules/account/audit.ts`** — imports `accountAuditActions` for the named audit action constants.
- **`src/modules/account/cooldown.ts`** — imports `cooldownRemaining` (drives the 60 s window) and `resendTooSoon` (builds the 429 response).
- **`src/modules/account/emails.ts`** — imports `verifyRequestEmail` (builds the email body/route) and `recipientLocale` (resolves the recipient's language).
- **`src/modules/account/roles.ts`** — imports `isUnrestrictedCaller` to decide `actor_role` in `auditProvenAddress`.
- **`src/modules/account/services/authentication.ts`** — imports `tokenAdd` to mint the verification token onto the user document.
- **`src/modules/account/controllers/post-signup.ts`** — listed as a caller of `sendVerificationEmail` (the signup side-effect path); no import from this file into the controller.

## Notes

- **Token cleanup is UX, not security.** `sendVerificationEmail` removes all tokens of the same kind before minting a new one so the user never holds two working links. Spending *any* of them proves the same mailbox; the removal is purely "the newest email is the one that works."
- **Two token types are a hard boundary.** A `verify` token and an `email-change` token must never be interchangeable. The `VERIFICATION_TARGETS` map and the `VerificationTokenType` union make a third type impossible at the type level.
- **Cooldown is enforced in the service, not just the rate limiter.** The route's `credentialLimiters` uses `skipSuccessfulRequests`, which would let an unlimited number of *successful* sends through. Because each success publishes real mail, the 60 s window is checked here as well.
- **`markVerified` is async and cannot be folded into a plain `save`.** The `verifiedAt` field rides along on the document save, but the role promotion is a separate membership write with no document field to piggyback on. Callers must `await` it.
- **`auditProvenAddress` reads the caller's role after promotion**, not before, so the audit record's `actor_role` reflects the post-verification state.
- **TTL is deployment-tunable** via `NODE_EMAIL_VERIFY_TTL_MS`; the default is 24 h. The safe direction of adjustment is *shorter*, and the comment explicitly leaves the policy decision to the operator.
