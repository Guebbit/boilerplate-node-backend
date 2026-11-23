---
source: src/modules/account/tests/integration/service.test.ts
source_sha256: a33eaeea899044b0cb5c32a478c7556856a568698e419bdc90860f34ac8d081f
context_sha256: 26d53fa93a2e2b946f4271e6491b4185d2a0fef902657219c3699567b5df1b93
generated_at: 2026-11-22T04:00:59.391284+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/service.test.ts

## Purpose
Integration tests for the account service (`src/modules/account/services/index.ts`). They cover the security invariants of signup, login, password change and bulk token removal. Tests are grouped by the invariant each one defends, not by function. Examples are indistinguishable login failures (so the endpoint can't enumerate accounts), soft-deleted accounts not being able to log in, and passwords never being stored as sent. They run against a real test database.

## Key elements
- **`jest.mock('@infrastructure/observability/analytics', …)`** replaces `emitAnalyticsEvent` with `jest.fn()` and keeps the rest of the module via `requireActual`. It is a replacement because `jest.spyOn` can't redefine the non-configurable getter on a CommonJS namespace import.
- **`setupTestDb()`** sets up the test database for the suite.
- **`describe('signup')`** is the part of the file visible here. It covers:
  - Persistence of the created account.
  - A 422 for a body with an unknown field (e.g. `role`), with nothing created.
  - The password stored as an argon2id PHC hash (`$argon2id$v=19$m=19456,t=2,p=1$…`), not plaintext.
  - A 422 for a mismatched confirmation.
  - A 409 (not 422) for an email already in use.
  - A 422 table (`it.each`) for a bad email, a bad username and a short password.
  - A 422 when terms aren't accepted, with nothing stored.
  - An absent image stored as no `imageUrl` field, never `''`.
  - Recording `termsAcceptedAt`, `termsVersion` (default `'1'`) and `analyticsConsent`/`analyticsConsentAt`.
  - The configured `NODE_TERMS_VERSION` being stamped, via `withEnvironmentOverrides`.
- **`describe('NODE_ANTIBOT_EMAIL_POLICY')`** checks that the policy is off by default, so a disposable domain (`mailinator.com`) still signs up. With policy `'disposable'` the service returns a success envelope with `isNew: true` but persists nothing.
- Imports for login, `passwordChange`, `issueToken`, `hashToken`, `plantSession`/`plantToken` and the session/token row helpers show the file also covers those areas further on.

## Relationships
- Exercises `accountService` from `src/modules/account/services/index.ts`. It also imports `issueToken` from `src/modules/account/services/tokens.ts` and `passwordChange` from `src/modules/account/services/password.ts`.
- Uses `hashToken` from `src/infrastructure/security/hash-token.ts`.
- Uses `createUser`, `userRepository` and the password constants (`PLAIN_PASSWORD`, `PASSPHRASE_PASSWORD`, `REPLACEMENT_PASSWORD`) from `src/modules/users/tests/factories.ts`. It queries users through `userRepository` (`findOne`, `findOneWithCredentials`) from `src/modules/users/repository.ts`.
- Uses `plantSession`, `plantToken`, `sessionRowsOf`, `tokenHashesOf` and `tokenRowsOf` from `src/modules/account/tests/factories.ts`.
- Imports `accountAnalyticsEvents` from `src/modules/account/analytics.ts` and the analytics port from `src/infrastructure/observability/analytics/index.ts`, which it mocks.
- Test helpers from `tests/support/`:
  - `setup-test-db.ts` provides `setupTestDb`.
  - `callers.ts` provides `testCallerContext`.
  - `response.ts` provides `asSuccess` and `asReject`.
  - `ports.ts` provides `observePort`.
  - `environment.ts` provides `setEnvironment` and `withEnvironmentOverrides`.

## Notes
- Assertions on the response status are the contract. 409 means a conflict with existing state, and 422 means field-level validation.
- Request bodies are strict, so a stray key is a 422 rather than being silently dropped.
- With the anti-bot policy on, the fake-success response is built from a document that `isNew` marks as never saved. `post-signup.ts` reads that flag to keep the audit trail and upload cleanup correct.
- Environment-dependent tests set variables through the `tests/support/environment.ts` helpers.
