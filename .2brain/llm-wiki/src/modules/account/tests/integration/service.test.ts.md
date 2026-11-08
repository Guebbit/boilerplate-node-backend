---
source: src/modules/account/tests/integration/service.test.ts
sha256: 7833b35142c47954a53a2d5cc1b86aea4d3999e19d3cb9c8b29727c13b7d347c
generated_at: 2026-11-08T04:42:16.112833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration tests for the account service, organized by the **security invariant** each test defends rather than by API function. The invariants under guard: login failure responses must be indistinguishable (preventing account enumeration), soft-deleted accounts must be unable to log in, and a password must never reach the database in its submitted form. These are regressions a happy-path test cannot catch; if one slips, it is a production incident.

## Key elements

- **`jest.mock('@infrastructure/observability/analytics', …)`** – Replaces the analytics port's `emitAnalyticsEvent` with a jest fn. Must use full module mock because `jest.spyOn` cannot redefine the non-configurable getter on a CommonJS namespace import.
- **`describe('signup')`** – Asserts account creation, argon2id hashing (PHC prefix match, not just inequality), 422 for mismatched confirmation / invalid input / missing terms, 409 for duplicate email, `NODE_ANTIBOT_EMAIL_POLICY` behavior (fake success + no persistence for disposable domains), absent `imageUrl` stays `undefined`, and terms/consent timestamp recording.
- **`describe('login')`** – (truncated in source) Asserts indistinguishable failure responses, soft-delete rejection, and successful credential verification.
- **`describe` blocks for password change & token removal** – (implied by module doc) Verify `passwordChange` and bulk token deletion invariants.
- **`it.each` for invalid input** – Parameterized 422 assertions for bad email, short username, short password.
- **`NODE_ANTIBOT_EMAIL_POLICY` suite** – Confirms the policy is off by default (disposable domain signs up normally) and, when `'disposable'`, returns a success-shaped envelope with `isNew: true` while persisting nothing.

## Relationships

- **`src/modules/account/services/index.ts`** – The `accountService` under test (`signup`, `login`, etc.).
- **`src/modules/account/services/password.ts`** – `passwordChange` exercised by the password-change invariant tests.
- **`src/modules/account/services/tokens.ts`** – `issueToken` used to seed token state for login/token-removal tests.
- **`src/infrastructure/security/hash-token.ts`** – `hashToken` imported for token-hash assertions.
- **`src/modules/account/analytics.ts`** – `accountAnalyticsEvents` consumed to verify expected analytics payloads.
- **`src/infrastructure/observability/analytics/index.ts`** – Mocked; `emitAnalyticsEvent` captured to assert event shape.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD`, `PASSPHRASE_PASSWORD`, `REPLACEMENT_PASSWORD`, `userRepository` used to seed and verify DB state.
- **`src/modules/users/index.ts` / `model.ts` / `repository.ts`** – `UserDocument` type and `userRepository.findOne` / `findOneWithCredentials` for persistence assertions.
- **`src/modules/account/tests/factories.ts`** – `plantSession`, `plantToken`, `sessionRowsOf`, `tokenHashesOf`, `tokenRowsOf` helpers for session/token setup and inspection.
- **`tests/support/callers.ts`** – `testCallerContext` supplies the authenticated-caller argument to every service call.
- **`tests/support/environment.ts`** – `setEnvironment` / `withEnvironmentOverrides` toggle `NODE_ANTIBOT_EMAIL_POLICY` and `NODE_TERMS_VERSION` per test.
- **`tests/support/ports.ts`** – `observePort` referenced in the analytics-mock rationale comment.
- **`tests/support/response.ts`** – `asSuccess` / `asReject` unwrap the service's discriminated-union return for clean assertions.

## Notes

- Tests are deliberately grouped by **invariant**, not by endpoint. A new security property gets its own block regardless of which service function it touches.
- The analytics mock uses `jest.mock` with `requireActual` spread, **not** `jest.spyOn`. The file comment explains why: CommonJS namespace objects expose non-configurable getters that `spyOn` cannot override.
- The `NODE_ANTIBOT_EMAIL_POLICY: 'disposable'` test asserts `response.data.isNew === true` even though nothing was persisted. This flag is read downstream by `post-signup.ts` to skip audit-trail and upload-cleanup side effects—changing the response shape here will break that consumer.
- The password-hash test matches the full PHC prefix `^\$argon2id\$v=19\$m=19456,t=2,p=1\$` rather than merely asserting inequality with the input. This pins the algorithm *and* its parameters; a downgrade to a weaker KDF would fail the test.
- `setEnvironment` is called at the top of individual `it` blocks (not in `beforeEach`) because each test needs a specific env value; the test DB (`setupTestDb()`) runs once at module level.
