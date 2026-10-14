---
source: src/modules/account/tests/integration/password-hashing.test.ts
sha256: cda7fecdf1a5c4fd3c8bdfa199892e8d21fcd86d3f975a0d48ff51152bb97dfd
generated_at: 2026-10-14T09:12:14.017019+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/password-hashing.test.ts

## Purpose

Integration tests that verify how `accountService` handles password hashing at the boundaries: a decoy hash is computed for unknown addresses (timing-safe), long passwords are compared in full without 72-byte truncation, and the password shape policy is length-only (no character-class rules).

## Key elements

- **`jest.mock('@infrastructure/security/password-hash')`** — Replaces `verifyPassword` with a `jest.fn` that wraps the real implementation; all other exports pass through.
- **`describe('login with an unknown address')`** — Asserts `verifyPassword` is called exactly once and receives an `$argon2id$v=19$m=19456,t=2,p=1$`-formatted hash as its second argument (the decoy).
- **`describe('a long password')`** — Creates a user whose password is a shared 72-byte prefix plus a unique suffix; asserts a login with the same prefix but different suffix fails (no truncation to 72 bytes).
- **`describe('the password shape')`** — Sets a long, all-lowercase passphrase via `passwordChangeWithCurrent` and confirms subsequent login succeeds (length is the sole policy).

## Relationships

- **`src/infrastructure/security/password-hash.ts`** — Mocked at module level; `verifyPassword` is the function under observation. The test asserts on its call count and the hash parameter it receives.
- **`src/modules/account/services/index.ts`** — Source of `accountService`; the test calls `.login()` and `.passwordChangeWithCurrent()`.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser`, `LEGACY_PASSWORD`, and `PLAIN_PASSWORD` fixtures.
- **`tests/support/ports.ts`** — Provides `observePort`, a utility that wraps a mock to expose call history for assertions.
- **`tests/support/callers.ts`** — Provides `testCallerContext` passed to `passwordChangeWithCurrent`.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, called once at module level to prepare the integration database.

## Notes

- The file deliberately avoids `jest.spyOn` on the namespace import because the mutation run's SWC transform prevents redefining a namespace getter. The manual `jest.mock` factory with `jest.requireActual` is the workaround (see `tests/support/ports.ts` for the convention).
- `observePort` is used instead of reading `mock.calls` directly, keeping the call-inspection pattern consistent across the test suite.
