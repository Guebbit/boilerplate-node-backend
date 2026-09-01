# src/modules/account/services/verification.ts

## Purpose

Centralises all email-verification logic—token issuance, email dispatch, and account confirmation—so the three flows that trigger it (signup, profile email change, explicit re-send) share one code path and cannot drift. Tokens are scoped to the string type `'verify'` (outside the JWT `TokenType` enum) and expire after 24 hours.

## Key elements

- **`EMAIL_VERIFY_TOKEN_TYPE`** (`'verify'`) – the `tokens.type` discriminator for verification tokens; deliberately a plain string, not a `TokenType` enum member.
- **`EMAIL_VERIFY_TOKEN_TTL_MS`** – 86 400 000 ms (24 h) token lifetime.
- **`sendVerificationEmail(user, context)`** – removes all existing `'verify'` tokens, issues a fresh one via `tokenAdd`, localises the email body, and enqueues the job through `enqueueEmail`. The shared primitive called by all three flows.
- **`requestEmailVerification(user, context)`** – wraps `sendVerificationEmail` and emits an `AUTH_EMAIL_VERIFY_REQUESTED` audit event. Used only by the explicit re-send endpoint, not by signup or email-change side-effects.
- **`requestEmailVerificationFor(userId, context)`** – end-to-end handler for `POST /account/verify-request`: loads the user with credentials, rejects 404 / 409 (already verified), then delegates to `requestEmailVerification`. Returns `ResponseSuccess<undefined>` or `ResponseReject`.
- **`completeEmailVerification(user, context)`** – sets `user.verified = true`, persists via `userRepository.save`, emits an `AUTH_EMAIL_VERIFY_COMPLETED` audit event (includes `actor_role`). Assumes the token was already spent by the caller (`postVerifyConfirm` → `spendLiveToken`).

## Relationships

- **`services/authentication.ts`** – imports `tokenAdd` to mint the verification token onto the user document.
- **`account/emails.ts`** – imports `verifyRequestEmail` to build the localised subject, template, and data for the mail job.
- **`infrastructure/adapters/mailer.ts`** – calls `enqueueEmail` to publish the job to the email worker.
- **`infrastructure/i18n`** (`catalog.ts`, `context.ts`, `index.ts`) – uses `t` for error/success messages and `getDefaultLocale` as the final fallback when neither the user nor the caller supplies a locale.
- **`infrastructure/http/response.ts`** – constructs `generateSuccess` / `generateReject` return values.
- **`infrastructure/http/request.ts`** – consumes `CallerContext` (locale, auth identity) passed in by controllers.
- **`infrastructure/observability/audit.ts`** – calls `emitAuditEvent` / `buildAuditEvent` for both the request and completion events.
- **`account/audit.ts`** – supplies the `accountAuditActions` enum members used as audit action identifiers.
- **`modules/users/index.ts`** – uses `userRepository.findByIdWithCredentials` and the `UserDocument` type.
- **`controllers/post-signup.ts`**, **`controllers/put-account.ts`** – upstream callers that invoke `sendVerificationEmail` as a side-effect (no audit "request" event).
- **`services/index.ts`** – re-exports this module's public API.
- **`tests/integration/self-service.test.ts`** – integration-covers the re-send and confirm flows.

## Notes

- Token removal before issuance is an UX guarantee ("newest email wins"), not a security measure—spending any prior token already proves mailbox ownership.
- `completeEmailVerification` does **not** re-check or spend the token; that responsibility lives upstream in `postVerifyConfirm` / `spendLiveToken` (atomic `$pull`). Calling this function with an already-spent token would still mark the account verified.
- The 409 "already verified" response is intentional and honest (no enumeration blurring needed because the caller is authenticated and querying their own account).
- Locale resolution order: `user.locale` → `context.locale` → `getDefaultLocale()`. The fully-rendered template is attached to the job, so the email worker never needs a locale.
