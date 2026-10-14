---
source: src/modules/account/tests/integration/service.test.ts
sha256: 5b3fe83357338e247318763d417cb578559791307944658999bfa2f001368f04
generated_at: 2026-10-14T09:14:41.832072+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration test suite for `accountService` that verifies security invariants a happy-path test cannot catch: password-at-rest hashing, login-failure indistinguishability, soft-delete login prevention, and bulk token removal. Each test is grouped by the invariant it defends rather than by the API function under test, so a regression in any one arm fails immediately.

## Key elements

- **`describe('signup')`** — verifies account creation, 422/409 status-code contracts, argon2id hash-at-rest, absent-image-as-undefined-field, terms/consent persistence, and parameterized input-validation rejects.
- **`NODE_ANTIBOT_EMAIL_POLICY` block** — proves the policy is off by default (disposable domain signs up normally) and, when enabled, returns a success-shaped envelope (`isNew: true`) while persisting **no** document.
- **`describe('login')`** — asserts that "unknown account" and "wrong password" rejections are *equal to each other* (not equal to a literal), preventing an account-existence oracle.
- **`jest.mock('@infrastructure/observability/analytics', …)`** — replaces the analytics port's `emitAnalyticsEvent` with a `jest.fn` (see Notes).
- **`setupTestDb()`** — spins up a real database for every test in the file.
- **`asSuccess` / `asReject`** (from `tests/support/response.ts`) — unwrap the service's discriminated-union result for clean assertions.

## Relationships

- **`src/modules/account/services/index.ts`** — system under test; all `accountService.*` calls target this module.
- **`src/modules/users/tests/factories.ts`** — provides `createUser`, `userRepository`, and password constants (`PLAIN_PASSWORD`, `LEGACY_PASSWORD`, `REPLACEMENT_PASSWORD`).
- **`src/modules/users/index.ts` / `model.ts` / `repository.ts`** — `UserDocument` type and `userRepository.findOne*` used to verify what was actually persisted.
- **`src/modules/account/tests/factories.ts`** — `plantSession`, `plantToken`, `sessionRowsOf`, `tokenHashesOf`, `tokenRowsOf` for session/token setup and inspection.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` used when planting tokens to assert bulk-removal behavior.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` constants for asserting which events the analytics port received.
- **`src/infrastructure/observability/analytics/index.ts`** — mocked at module level; `observePort` (from `tests/support/ports.ts`) reads the mock's call log.
- **`tests/support/environment.ts`** — `setEnvironment` toggles `NODE_ANTIBOT_EMAIL_POLICY` per test.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller metadata expected by the service.

## Notes

- **Analytics port is replaced, not spied.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes; the file therefore uses `jest.mock` with a `jest.fn()` substitution (see `tests/support/ports.ts` for the `observePort` helper that reads the result).
- **Login-indistinguishability assertion style.** The two failure responses are compared *to each other* rather than to a fixed status/message. This keeps the test valid if the error copy or code is deliberately changed, while still failing the moment the two arms diverge.
- **Anti-bot "ruse" response.** When the policy blocks a disposable domain, the service returns a success envelope (`isNew: true`) but writes nothing to the DB. Tests assert both the shape of the response *and* the absence of a row — the `isNew` flag is what lets downstream `post-signup` hooks (audit trail, upload cleanup) behave honestly.
- **Password-at-rest check is specific.** The assertion matches the argon2id PHC prefix (`$argon2id$v=19$m=19456,t=2,p=1$`) rather than merely asserting "not equal to plaintext," so a switch to a weaker algorithm would also fail.
- **Real database, not mocks.** `setupTestDb()` + direct `userRepository` queries make this an integration test; it catches issues in the `pre('save')` hook and Mongoose schema that a pure unit test would miss.
