---
source: src/modules/account/tests/integration/service.test.ts
sha256: 4ee345d8e60e08b870d4c9e5337cec7a10bdba41d71073a1adad40aa997fe903
generated_at: 2026-09-27T14:35:53.333047+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration tests for the account service (`accountService`) that guard security **invariants** rather than happy paths: login-failure responses must be indistinguishable, soft-deleted accounts must be rejected, and plaintext passwords must never reach the database. Tests are grouped by the invariant each defends, so a regression in any one is caught even when every "happy path" still passes.

## Key elements

- **`describe('signup')`** — Covers account creation: persistence, password hashing (`$2[aby]$` bcrypt prefix), 422 on mismatched confirmation, 409 on duplicate email, invalid-input parameterised cases, image-URL default, terms-required check, and analytics-consent persistence.
- **`NODE_ANTIBOT_EMAIL_POLICY` block** — Verifies the anti-disposable-email guard is off by default; when enabled, asserts the service returns a *fake* success (`isNew: true`, no DB row) so the client sees a normal 201 while nothing is persisted.
- **`jest.mock('@infrastructure/observability/analytics', …)`** — Replaces the analytics port's `emitAnalyticsEvent` with a `jest.fn`. The file comment explains this must be a full mock (not `jest.spyOn`) because the CJS namespace getter is non-configurable.
- **`setupTestDb()`** — Boots the in-memory/ephemeral database once for the suite.
- **(Truncated) `login`, `password change`, `bulk token removal` describes** — Referenced in the module docblock as the remaining invariant groups.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | The SUT — `accountService.signup`, `.login`, `.changePassword`, `.removeTokens` are called directly. |
| `src/modules/users/tests/factories.ts` | Provides `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `LEGACY_PASSWORD`, and a pre-wired `userRepository` for post-condition assertions. |
| `src/modules/users/index.ts` | Exports `hashToken`, `DEFAULT_USER_IMAGE_URL`, `TokenType`, `Token`, `UserDocument` used in assertions and setup. |
| `src/modules/users/repository.ts` | `userRepository.findOne` / `findOneWithCredentials` are used to verify what actually hit the DB (hash prefix, absence of rows, default image URL). |
| `src/modules/users/model.ts` | The Mongoose `pre('save')` hook that hashes the password is the mechanism the "never stores plaintext" test guards indirectly. |
| `src/infrastructure/observability/analytics/index.ts` | Fully mocked so `emitAnalyticsEvent` is a `jest.fn`; tests can later assert call shape. |
| `src/modules/account/analytics.ts` | `accountAnalyticsEvents` imported for asserting which analytics events fire per action. |
| `tests/support/ports.ts` | `observePort` utility (documented as the reason the analytics mock is a full `jest.mock` rather than a spy). |
| `tests/support/response.ts` | `asSuccess` / `asReject` unwrap the service's `Result` type so tests can assert on `.data` or `.status` + `.errors`. |
| `tests/support/callers.ts` | `testCallerContext` supplies the auth/caller metadata the service expects. |
| `tests/support/setup-test-db.ts` | Initialises the test database before any `it` block runs. |

## Notes

- **Grouping convention:** tests are organised by *invariant* (e.g. "indistinguishable failures", "password never plaintext"), not by API method. A new invariant should get its own `describe`, not be appended to an existing one.
- **`isNew: true` on fake success:** the anti-bot path deliberately constructs a document that *looks* saved (so downstream `post-signup` cleanup and audit logic see a valid shape) while `userRepository.findOne` returns `null`. Don't "fix" this by returning an error—the 201 is the contract.
- **409 vs 422 is a deliberate contract:** duplicate email must be 409 (conflict), not 422 (validation), because the client UI branches on status to show "email taken" vs. inline field errors.
- **Analytics mock style:** the file uses `jest.mock` with `jest.requireActual` spread, not `jest.spyOn`. If you add new analytics assertions, work with the existing mock rather than introducing a spy.
- **`NODE_ANTIBOT_EMAIL_POLICY` restoration:** the `afterEach` restores the env var to its original value (or deletes it). New env-var tests in this file should follow the same save/restore pattern.
