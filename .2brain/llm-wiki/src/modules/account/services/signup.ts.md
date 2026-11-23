---
source: src/modules/account/services/signup.ts
source_sha256: eaaf7a295870b259663dcd3e34566b3f39de80a7b1d023bc96c90220f19eea79
context_sha256: 71001e7f403e5a7e29465fbff29b5018782d540e9142437f056acb4347768f14
generated_at: 2026-11-22T03:42:15.977502+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/signup.ts

## Purpose
Implements `POST /account/signup`. It parses and validates the body, runs a series of gates (breached-password check, anti-automation email policy), then creates the user account through the user service. Each outcome is recorded in the audit trail, and a successful signup also emits an analytics event. Logging in lives in `./login`.

## Key elements
- `signupSchema` (private) — the contract's `SignupBody` (strict, so unknown keys give a 422) extended with:
  - `analyticsConsent`, which uses `optionalBooleanSchema` (the same multipart-string decode as `PUT/PATCH /account`).
  - `termsAccepted`, which is decoded with `parseFormBoolean` and must be literal `true`.
  - A `superRefine` that checks `passwordConfirm === password`.
- `SignupInput` (exported type) — the inferred type of the parsed body.
- `guardBreachedPassword` — calls `assertPasswordNotBreached`. If it reports errors, it returns a 422 reject. Otherwise it returns `undefined`.
- `guardEmailPolicy` — calls `checkEmailPolicy`. On a `'refused'` verdict it returns a decoy success built with `accountUserService.buildSignupDecoy`, and that document is never persisted. Otherwise it returns `undefined`.
- `createAccountIfEmailFree` — calls `emailTaken`. If the email is taken it returns a 409 `EMAIL_ALREADY_USED`. Otherwise it calls `registerSelfService` (storing `getCurrentLocale()` as `locale`) and then `enqueueIfPending`, and returns a success. A single `.catch` maps database errors through `rejectDatabaseEnvelope('auth', …)`.
- `signup(body, callerContext)` (exported) — the entry point. If parsing fails it returns a 422 built with `validationErrors`. Otherwise it chains the gates in order: breached password, then email policy, then account creation. The first gate to answer decides the result. It then records the audit entry and the analytics event.

## Relationships
- **Infrastructure gates**:
  - `src/infrastructure/security/breached-passwords/index.ts` supplies the password check.
  - `src/infrastructure/adapters/antibot.ts` supplies `checkEmailPolicy`.
- **HTTP layer**:
  - `src/infrastructure/http/response.ts` provides `generateSuccess`, `generateReject`, `validationErrors` and the response types.
  - `src/infrastructure/http/errors.ts` provides `rejectDatabaseEnvelope`.
  - `src/infrastructure/http/request.ts` provides `parseFormBoolean`.
  - `src/infrastructure/http/schemas.ts` provides `optionalBooleanSchema`.
- **i18n**: `t` is used for the validation and conflict messages, and `getCurrentLocale` supplies the locale stored on the new user.
- **Audit and analytics**:
  - `src/infrastructure/observability/audit.ts` provides `recordAudit`, called with the account audit action `AUTH_SIGNED_UP` from `src/modules/account/audit.ts`.
  - `src/infrastructure/observability/analytics/index.ts` provides `emitAnalyticsEvent` and `buildAnalyticsBase`, used with the account analytics event `USER_SIGNED_UP` from `src/modules/account/analytics.ts`.
- **Consent**: `analyticsAnswer` and `termsAcceptance` from `src/modules/account/consent-record.ts` are spread into both the decoy and the real registration payloads.
- **Users module**: `accountUserService` (from `@modules/users/friends/account`) does all persistence. `UserDocument` is the return type.
- `src/modules/account/services/index.ts` and `src/infrastructure/adapters/logger.ts` are graph neighbors, but this file does not reference either.

## Notes
- **Decoy success**: a refused email-policy verdict returns the same shape as a real signup, so a script gets nothing to iterate on.
- **`isNew` check**: `result.data.isNew` is true only for the unsaved decoy, so in the audit step `isNew === true` means no account was created. Failures and decoys are audited as `outcome: 'failure'` with actor `'anonymous'`, and no analytics event is emitted for them. Real signups are audited as `'success'` with the new user's id as actor and role `'user'`.
- **Gate order**: the breach check runs first, since a breached password fails signup regardless of anything else. Only after that do the email-policy check and the database lookup run.
- **Absent consent**: absent `analyticsConsent` is stored as `false`, because there is no prior value at signup.
- **No image**: signup takes no image.
- **`callerContext`**: it is used only for the audit and analytics records.
