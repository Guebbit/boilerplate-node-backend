# src/modules/account/services/verification.ts

## Purpose

Centralises the full email-verification lifecycle — token issuance, localised email composition, queueing, and the final "mark verified" write — in one module so that the three flows that trigger it (signup, email-address change, explicit re-send) share a single code path and cannot drift.

## Key elements

- **`EMAIL_VERIFY_TOKEN_TYPE`** (`'verify'`) — string constant used as the `tokens.type` discriminator; deliberately *not* a `TokenType` enum member.
- **`EMAIL_VERIFY_TOKEN_TTL_MS`** (`86 400 000`) — 24-hour token lifetime.
- **`sendVerificationEmail(user, context)`** — core helper: removes all prior `verify` tokens, adds a new one via `tokenAdd`, composes the localised email (recipient's own locale → caller's locale → default), and enqueues it at **high** priority. Resolves when the job is queued, not when the mail is delivered.
- **`requestEmailVerification(user, context)`** — wraps `sendVerificationEmail` and emits an `AUTH_EMAIL_VERIFY_REQUESTED` audit event. Exists as a separate function so that the signup and email-change callers (which call `sendVerificationEmail` directly) do *not* trigger this "user explicitly asked" audit action.
- **`requestEmailVerificationFor(userId, context)`** — end-to-end handler for `POST /account/verify-request`. Loads the user with credentials, returns **404** (not found) or **409** (already verified) before delegating to `requestEmailVerification`. Returns a typed `ResponseSuccess | ResponseReject`.
- **`completeEmailVerification(user, context)`** — sets `user.verified = true`, persists via `userRepository.save`, and emits an `AUTH_EMAIL_VERIFY_COMPLETED` audit event with actor role. Assumes the token has already been atomically spent (see `./tokens`).

## Relationships

- **`../emails.ts`** — imports `verifyRequestEmail` to build subject, template, and data for the verification mail.
- **`./authentication.ts`** — imports `tokenAdd` to mint the verification token onto the user document.
- **`@modules/users`** — imports `userRepository` (load/save) and the `UserDocument` type.
- **`@infrastructure/adapters/mailer.ts`** — imports `enqueueEmail` to publish the email job at high priority.
- **`@infrastructure/i18n/*`** — imports `t` and `getDefaultLocale` for message localisation.
- **`@infrastructure/observability/audit.ts`** — imports `emitAuditEvent` / `buildAuditEvent` for the two audit actions.
- **`../audit.ts`** — imports `accountAuditActions` (the enum of account-level audit action keys).
- **`@infrastructure/http/request.ts`** — imports the `CallerContext` type (supplies `locale` as fallback).
- **`@infrastructure/http/response.ts`** — imports `generateSuccess` / `generateReject` and the response union types used by `requestEmailVerificationFor`.
- **`controllers/post-signup.ts`** and **`controllers/put-account.ts`** — upstream callers: signup triggers `sendVerificationEmail`; the put-account (email-change) path does the same. Neither goes through `requestEmailVerification`, so the "request" audit event is not emitted for them.
- **`services/index.ts`** — barrel re-export; this module is consumed by controllers through the services index.

## Notes

- **Token replacement is a UX choice, not a security one.** Old tokens are wiped before a new one is issued so that "the newest email is the one that works." Spending *any* token already proves mailbox ownership.
- **Email is composed before enqueue.** The template, subject, and data are finalised in the request context (with locale resolved) so the email worker needs no locale lookup.
- **`completeEmailVerification` does not verify the token.** The race-safe `$pull` that spends the token lives in `./tokens` (`spendLiveToken`). By the time this function runs, the token is already consumed; it only writes `verified = true` and audits.
- **409 on already-verified is intentional.** Because the caller is authenticated and querying their own account, there is no enumeration risk, so an honest `409` is preferred over a silent `200`.
- **`EMAIL_VERIFY_TOKEN_TYPE` is a bare string** (`'verify'`) rather than a `TokenType` enum member — the enum only covers types the JWT layer recognises; this one is scoped to account endpoints.
