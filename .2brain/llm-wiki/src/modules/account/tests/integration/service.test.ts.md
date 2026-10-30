---
source: src/modules/account/tests/integration/service.test.ts
sha256: 7833b35142c47954a53a2d5cc1b86aea4d3999e19d3cb9c8b29727c13b7d347c
generated_at: 2026-10-29T03:00:40.252854+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration tests for the account service's security invariants across signup, login, password change, and bulk token removal. Tests are grouped by the invariant each defends (e.g., "two login failures must be indistinguishable," "a password must never be stored as it arrived") rather than by function, because these regressions are invisible to happy-path tests and constitute real security incidents if they slip.

## Key elements

- **`describe('signup', …)`** — Verifies account creation, password hashing (asserts the `$argon2id$` PHC prefix, not merely "differs"), mismatched-confirmation → 422, duplicate-email → 409, anti-bot email policy (off by default; when on, returns a success-shaped envelope but never persists), input validation, absent-image handling, terms/consent recording, and configurable `NODE_TERMS_VERSION`.
- **`describe('login', …)`** — Exercises the login path using a `createLoginUser` helper built on `createUser`; asserts the two failure modes are indistinguishable and that a soft-deleted account cannot authenticate.
- **`jest.mock('@infrastructure/observability/analytics', …)`** — Replaces the analytics port with a `jest.fn()` so tests can assert emitted events without the real sink.
- **`setupTestDb()`** — Boots a real (test) database so persistence assertions (`userRepository.findOne`, `findOneWithCredentials`) exercise the actual `pre('save')` hashing hook.

## Relationships

- **`src/modules/account/services/index.ts`** — Provides `accountService`, the primary subject under test (`signup`, `login`, etc.).
- **`src/modules/account/services/password.ts`** — Exports `passwordChange`, tested for the "never store plaintext" invariant.
- **`src/modules/account/services/tokens.ts`** — Exports `issueToken`, used to seed token rows before bulk-removal assertions.
- **`src/modules/account/analytics.ts`** — Exports `accountAnalyticsEvents` used to assert the correct event names are emitted.
- **`src/infrastructure/observability/analytics/index.ts`** — The analytics port that is **mocked** (replaced, not spied) so `emitAnalyticsEvent` becomes a `jest.fn()`.
- **`src/infrastructure/security/hash-token.ts`** — Provides `hashToken` for asserting token hashes in DB rows.
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser`, `PLAIN_PASSWORD`, `PASSPHRASE_PASSWORD`, `REPLACEMENT_PASSWORD`, and a test-scoped `userRepository` for direct DB reads.
- **`src/modules/account/tests/factories.ts`** — Supplies `plantSession`, `plantToken`, `sessionRowsOf`, `tokenHashesOf`, `tokenRowsOf` for seeding and inspecting session/token state.
- **`src/modules/users/index.ts` / `src/modules/users/model.ts` / `src/modules/users/repository.ts`** — `UserDocument` type, Mongoose model, and repository used for persistence assertions.
- **`tests/support/response.ts`** — `asSuccess` / `asReject` unwrap the service's tagged-union responses.
- **`tests/support/callers.ts`** — `testCallerContext` provides the required request-context argument.
- **`tests/support/environment.ts`** — `setEnvironment` and `withEnvironmentOverrides` toggle `NODE_ANTIBOT_EMAIL_POLICY` and `NODE_TERMS_VERSION` per-test.
- **`tests/support/ports.ts`** — `observePort` helper for capturing port invocations.

## Notes

- **Analytics port is replaced, not spied on.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes; `jest.mock` + `requireActual` spread is the workaround (see `tests/support/ports.ts` for the pattern).
- **Anti-bot "success" is a deliberate ruse.** When the policy is active, the response envelope is indistinguishable from a real signup, but the document is never saved. The `isNew` flag lets downstream hooks (`post-signup.ts`) keep audit/cleanup honest without leaking the rejection.
- **409 vs 422 is contractual, not cosmetic.** 409 signals "conflict with existing state" (drives the "email already taken" UI path); 422 signals field-level validation failure. A test asserting the wrong code is a bug.
- **Password assertion checks the PHC prefix** (`$argon2id$v=19$m=19456,t=2,p=1$`) rather than just "not equal to plaintext," so it catches a downgrade to a weaker or missing hash.
