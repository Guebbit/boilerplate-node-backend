---
source: src/modules/account/tests/integration/service.test.ts
sha256: 8ec36dd94b2ea0c5306707e470f61d1a0ad016621cf934d6a9bc2122f4c1e0d8
generated_at: 2026-11-14T19:10:33.871517+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration tests for the account service that verify security invariants rather than happy-path flows: indistinguishable login failures, soft-delete enforcement, password-at-rest hashing, strict body validation, and anti-bot email policy. Grouped by the invariant each test defends, because a regression in any of these is a production incident no unit test would catch.

## Key elements

- **`jest.mock('@infrastructure/observability/analytics', …)`** — replaces the analytics port with a `jest.fn()` (not `spyOn`, which fails on non-configurable CJS namespace getters). Runs before all tests.
- **`setupTestDb()`** — initialises a fresh in-memory database for the whole suite.
- **`describe('signup')`** — the bulk of the visible tests:
  - Happy-path creation and DB persistence check.
  - Strict body validation (unknown key → 422, no row created).
  - Password never stored as plaintext; asserts the `$argon2id` PHC prefix.
  - Mismatched confirmation → 422 with error messages.
  - Duplicate email → 409 (conflict, not validation).
  - `NODE_ANTIBOT_EMAIL_POLICY` sub-suite: off by default (disposable domain signs up); on, returns a success-shaped envelope with `isNew: true` but persists nothing.
  - Parameterised invalid-input cases (bad email, short username, short password) → 422.
  - Absent image stored as `undefined`, never `''`.
  - Terms not accepted → 422, no row.
  - Terms/consent metadata (`termsAcceptedAt`, `termsVersion`, `analyticsConsent`, `analyticsConsentAt`) recorded correctly.
  - `NODE_TERMS_VERSION` env override stamped into the record.
- **Imports for later (truncated) sections** — `issueToken`, `passwordChange`, `hashToken`, and token/session factory helpers (`plantSession`, `plantToken`, `sessionRowsOf`, `tokenHashesOf`, `tokenRowsOf`) indicate coverage of login, token issuance, password change, and bulk token removal.

## Relationships

- **`src/modules/account/services/index.ts`** — the primary subject under test.
- **`src/modules/account/services/tokens.ts`** — `issueToken` called to set up or exercise token flows.
- **`src/modules/account/services/password.ts`** — `passwordChange` exercised in its dedicated section.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` imported for token-related assertions.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` referenced to assert correct event shapes.
- **`src/infrastructure/observability/analytics/index.ts`** — mocked at module level; `emitAnalyticsEvent` is the only observable side-effect.
- **`src/modules/users/repository.ts`** / **`src/modules/users/tests/factories.ts`** — `userRepository` and `createUser` used for DB assertions and seed data.
- **`src/modules/account/tests/factories.ts`** — `plantSession`, `plantToken`, and row readers used in token/session tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the auth context for service calls.
- **`tests/support/response.ts`** — `asSuccess` / `asReject` unwrap the service result envelope for assertion.
- **`tests/support/environment.ts`** — `setEnvironment` and `withEnvironmentOverrides` control `NODE_ANTIBOT_EMAIL_POLICY` and `NODE_TERMS_VERSION`.
- **`tests/support/ports.ts`** — `observePort` helper for analytics assertion patterns.

## Notes

- The analytics port is **mocked via `jest.mock`**, not `jest.spyOn`. A comment in the file explains why: the CJS namespace getter is non-configurable, so `spyOn` throws. Any new test file that needs to intercept analytics must follow the same pattern.
- Tests assert on **DB state** (via `userRepository.findOne` / `findOneWithCredentials`) in addition to the returned envelope. A test that only checks the response would miss persistence bugs.
- The anti-bot "success" path intentionally returns a document with `isNew: true` so downstream middleware (`post-signup.ts`) can distinguish it from a real signup without leaking information to the client.
- Password hashing is asserted by PHC format (`$argon2id`), not merely "not equal to input," to guard against a switch to a weaker algorithm.
- Environment variables (`NODE_ANTIBOT_EMAIL_POLICY`, `NODE_TERMS_VERSION`) are set/reset per-test via the `tests/support/environment` helpers; they do not leak between test files because the suite is integration-level.
