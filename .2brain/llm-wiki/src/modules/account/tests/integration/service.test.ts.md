---
source: src/modules/account/tests/integration/service.test.ts
sha256: d410f8aaae9fc3741b7a1a390ceae9b769c58168e71cd28a37a0703d3c86e5a8
generated_at: 2026-09-23T18:14:47.784022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration tests that verify the **security invariants** of the account service (signup, login, password change, bulk token removal). Tests are grouped by the invariant each defends rather than by function — e.g., the two login failure paths must be indistinguishable, a soft-deleted account must not authenticate, and a password must never be stored in plaintext. Each case is designed to survive a regression that a happy-path assertion alone would miss.

## Key elements

- **`jest.mock('@infrastructure/observability/analytics', …)`** — Replaces (not spies on) the analytics port so `emitAnalyticsEvent` is a plain `jest.fn`. A comment explains `jest.spyOn` cannot redefine the non-configurable getter on a CommonJS namespace import.
- **`setupTestDb()`** — Boots the in-memory / temporary database once per suite.
- **`describe('signup', …)`** — Covers: successful creation + DB persistence, bcrypt hashing (asserts `$2[aby]$` prefix), mismatched confirmation → 422, duplicate email → 409, `NODE_ANTIBOT_EMAIL_POLICY` off-by-default and on (disposable domain returns a success envelope with `isNew: true` but is **not** persisted), invalid input (parameterised 422), absent `imageUrl` stored as `''`, `termsAccepted: false` → 422, and `analyticsConsent` persistence.
- **`describe('login', …)`** — (Truncated in source; referenced by the module doc as covering indistinguishable failure paths and soft-deleted-account rejection.)
- **Password-change / token-removal blocks** — Referenced in the module doc as additional invariants tested further down.
- **Helpers used throughout**: `asSuccess` / `asReject` (response unwrapping), `testCallerContext` (auth context stub), `createUser` + password constants from the users factory, `userRepository.findOne` / `findOneWithCredentials` for DB assertions, `observePort` for analytics verification.

## Relationships

- **`@modules/account/services` (SUT)** — Every test calls `accountService.signup`, `.login`, etc. This file is the primary integration coverage for that module.
- **`@infrastructure/observability/analytics`** — Replaced via `jest.mock`; the real `emitAnalyticsEvent` is stubbed so tests can assert which events fire without a live analytics backend.
- **`@modules/account/analytics.ts`** — `accountAnalyticsEvents` is imported to identify the expected event names when asserting against the stubbed port.
- **`@modules/users`** — Provides `hashToken`, `TokenType`, `Token`, `UserDocument` types used in token-removal and credential checks.
- **`@modules/users/tests/factories.ts`** — Source of `createUser`, `LEGACY_PASSWORD`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and the shared `userRepository` used for post-assertion DB reads.
- **`tests/support/response.ts`** — `asSuccess` / `asReject` normalise the service's discriminated-union return so assertions are concise.
- **`tests/support/ports.ts`** — `observePort` provides the port-replacement pattern documented in the `jest.mock` comment.
- **`tests/support/callers.ts`** — `testCallerContext` supplies a fixed auth/request context for every call.
- **`tests/support/setup-test-db.ts`** — Initialises the test database schema.

## Notes

- **Analytics port is replaced, not spied on.** `jest.spyOn` cannot work here because a CommonJS `import * as` namespace exposes a non-configurable getter. The `jest.mock` factory spreads `requireActual` and overwrites only `emitAnalyticsEvent`.
- **Grouping is by invariant, not by function.** The module doc makes explicit that two login failures must be indistinguishable (account enumeration), a soft-deleted account must be rejected, and password hashing must survive "simplification." A happy-path test cannot catch any of these regressions.
- **Anti-bot policy defaults to off.** The `NODE_ANTIBOT_EMAIL_POLICY` tests assert that a known disposable domain (`mailinator.com`) signs up successfully when the env var is unset, and that when set to `'disposable'` the response *looks* like a real signup (`isNew: true`) but the document is never persisted.
- **Bcrypt prefix assertion** (`/^\$2[aby]\$/`) is intentional — it proves the hook fired and used bcrypt, not merely that the value differs from the input.
- **`imageUrl` default suppression.** Passing `undefined` must result in `''` in the DB, not the Mongoose schema default (a placeholder avatar). The test guards against the default firing and making the field indistinguishable from a deliberate choice.
