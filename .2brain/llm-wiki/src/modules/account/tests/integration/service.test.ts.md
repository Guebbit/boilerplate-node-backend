---
source: src/modules/account/tests/integration/service.test.ts
sha256: 132bf5effb4c86d52ddba69b4d51390aae7234767c01c0b83c9a78d46f176e31
generated_at: 2026-10-15T10:13:18.007303+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration test suite for the account service (`accountService`) that guards **security invariants** across signup, login, password change, and bulk token removal. Tests are grouped by the invariant each defends (indistinguishable login failures, no-login for soft-deleted accounts, no plaintext password storage) rather than by API function, so a mutation that breaks an invariant is caught even when every happy-path assertion still passes.

## Key elements

- **`describe('signup')`** — Verifies account creation, password hashing (argon2id PHC prefix), mismatched-password 422, duplicate-email 409, anti-bot disposable-domain policy (off by default; "success" ruse that never persists), input validation 422s, absent-image-as-undefined-field, terms/consent stamping, and configurable `NODE_TERMS_VERSION`.
- **`describe('login')`** — Correct-credential success, and (per the module doc) indistinguishability of wrong-password vs. unknown-email failures, plus soft-deleted-account rejection. *(Truncated in source.)*
- **`describe` blocks for password change & bulk token removal** — Referenced in the module doc comment; exercise `hashToken` and the account test factories (`plantToken`, `tokenHashesOf`, `tokenRowsOf`).
- **Analytics mock** — `jest.mock` replaces `emitAnalyticsEvent` with a `jest.fn()` so the port is swapped, not spied.
- **`setupTestDb()`** — Top-level DB setup called once before all suites.

## Relationships

- **`src/modules/account/services/index.ts`** — System under test; `accountService.signup`, `.login`, etc. are the methods exercised.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser`, `PLAIN_PASSWORD`, `PASSPHRASE_PASSWORD`, `REPLACEMENT_PASSWORD`, and the `userRepository` used to read back persisted documents and assert on stored state.
- **`src/modules/users/index.ts` / `model.ts` / `repository.ts`** — `UserDocument` type import; the repository is the persistence layer the tests verify against.
- **`src/modules/account/tests/factories.ts`** — `plantSession`, `plantToken`, `sessionRowsOf`, `tokenHashesOf`, `tokenRowsOf` helpers for token/session invariant tests.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` imported for token-related assertions.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` enum/constant used in analytics-emission assertions.
- **`src/infrastructure/observability/analytics/index.ts`** — Mocked via `jest.mock`; `emitAnalyticsEvent` replaced with a jest function.
- **`tests/support/response.ts`** — `asSuccess` / `asReject` unwrap the service's result type for assertions.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity passed to every service call.
- **`tests/support/environment.ts`** — `setEnvironment` / `withEnvironment` to toggle `NODE_ANTIBOT_EMAIL_POLICY` and `NODE_TERMS_VERSION` per-test.
- **`tests/support/ports.ts`** — `observePort` utility for analytics port assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initializes the test database before the suite runs.

## Notes

- **Analytics port is replaced, not spied.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes, so the file uses a full `jest.mock` factory (see inline comment referencing `tests/support/ports.ts`).
- **Assertions read back from the DB.** Persistence is confirmed by querying `userRepository.findOne` / `findOneWithCredentials`, not by inspecting the returned object alone — this catches a service that constructs a correct-looking doc without actually saving.
- **Password hash assertion uses a PHC regex** (`/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/`) rather than a simple "not equal to input" check, so a switch to a different algorithm or cost would also be flagged.
- **Anti-bot "success" is a deliberate ruse.** When `NODE_ANTIBOT_EMAIL_POLICY='disposable'`, the service returns a success envelope with `isNew: true`, but the document is marked as never-saved (via `isNew` flag) so downstream `post-signup.ts` keeps the audit trail and upload cleanup honest. The test asserts the row is **not** in the DB.
- **Status codes are contractual.** 409 vs. 422 is asserted explicitly because the client UI branches on the code to show "email taken" vs. a field-level validation error.
