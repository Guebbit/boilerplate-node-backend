# src/modules/account/services/verification.ts

## Purpose

Centralizes email-verification logic so that the three flows that trigger it (signup, email-address change, explicit re-send) share a single code path and cannot drift. It issues a token, enqueues the verification email, handles the `POST /account/verify-request` endpoint end-to-end, and writes the `verified` flag once the token is spent.

## Key elements

- **`EMAIL_VERIFY_TOKEN_TYPE`** (`'verify'`) — the string identifier stored in `tokens.type`; intentionally a raw string, not a `TokenType` enum member.
- **`EMAIL_VERIFY_TOKEN_TTL_MS`** — 24-hour lifetime (86 400 000 ms) for each issued verification token.
- **`sendVerificationEmail(user, context)`** — core shared function: removes all prior `'verify'` tokens, adds a new one via `tokenAdd`, resolves the recipient's locale, and enqueues the mail. Returns `Promise<void>` once the job is queued.
- **`requestEmailVerification(user, context)`** — thin wrapper around `sendVerificationEmail` that additionally emits an `AUTH_EMAIL_VERIFY_REQUESTED` audit event. Used only by the explicit re-send path so that signup and email-change side-effects are not counted as "requests."
- **`requestEmailVerificationFor(userId, context)`** — full handler for `POST /account/verify-request`: loads the user with credentials, rejects with 404 if missing, 409 if already verified, otherwise calls `requestEmailVerification` and returns a 200 success.
- **`completeEmailVerification(user, context)`** — sets `user.verified = true`, persists via `userRepository.save`, and emits an `AUTH_EMAIL_VERIFY_COMPLETED` audit event. Does **not** find or spend the token (the caller has already done that atomically).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports `enqueueEmail` to publish the verification mail as a background job.
- **`src/infrastructure/http/request.ts`** — imports the `CallerContext` type used by every exported function.
- **`src/infrastructure/http/response.ts`** — imports `generateSuccess` / `generateReject` to build the HTTP responses in `requestEmailVerificationFor`.
- **`src/infrastructure/i18n/*`** — imports `getDefaultLocale` and `t` for localized error/success strings and fallback locale resolution.
- **`src/infrastructure/observability/audit.ts`** — imports `emitAuditEvent` and `buildAuditEvent` to record verification actions.
- **`src/modules/account/audit.ts`** — imports the `accountAuditActions` enum (`AUTH_EMAIL_VERIFY_REQUESTED`, `AUTH_EMAIL_VERIFY_COMPLETED`).
- **`src/modules/account/controllers/post-signup.ts`** — calls `sendVerificationEmail` as a side-effect of account creation.
- **`src/modules/account/controllers/put-account.ts`** — calls `sendVerificationEmail` when the email address changes.
- **`src/modules/account/emails.ts`** — imports `verifyRequestEmail` which builds the subject, template, and data for the verification mail.
- **`src/modules/account/services/authentication.ts`** — imports `tokenAdd` to create the new verification token on the user document.
- **`src/modules/account/services/index.ts`** — barrel that re-exports the public API of this module.
- **`src/modules/account/tests/integration/self-service.test.ts`** — integration tests exercising the verify-request and complete-verification flows.
- **`src/modules/users/index.ts`** — imports `userRepository` and the `UserDocument` type for loading/persisting the account.

## Notes

- **Token type is a raw string, not an enum member.** `'verify'` is deliberately outside the `TokenType` union known to the JWT layer; it belongs solely to account endpoints (see the note on `UserMethods.tokenAdd` in the codebase).
- **`completeEmailVerification` is not a full verify handler.** It assumes the caller has already found the live token (`findLiveToken`) and spent it atomically (`spendLiveToken` with `$pull`). Duplicating that logic here would race.
- **`requestEmailVerificationFor` owns the user load** so that the `verified` precondition sits next to the operation it guards. The lower-level `requestEmailVerification` accepts an already-loaded user and cannot enforce preconditions on its own.
- **Exactly one verification link is valid at a time.** Old tokens are removed before the new one is issued. The stated rationale is UX (re-send for a lost mail) rather than security.
- **Email copy is resolved before enqueueing.** The locale chain is `user.locale → context.locale → getDefaultLocale()`; the mail worker receives a fully-rendered template and needs no locale at runtime.
