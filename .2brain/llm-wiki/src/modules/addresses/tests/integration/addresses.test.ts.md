---
source: src/modules/addresses/tests/integration/addresses.test.ts
sha256: 91fb111105cb50a11b195e5cdf16a36bf52dd32e531c02952120404d8ec15339
generated_at: 2026-10-14T14:54:12.001463+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/addresses.test.ts

## Purpose

Integration tests for the address-book module. They verify three cross-cutting invariants end-to-end against a real database: a non-empty book has exactly one default, foreign entries are indistinguishable from invented ones (404), and the book-cap + PII-encryption rules hold under both sequential and concurrent writes.

## Key elements

- **`labelsOf(userId)`** — helper that fetches the caller's book and returns the labels in stored order.
- **`withCap(body)`** — runs `body` with `NODE_ADDRESS_BOOK_MAX` set to `3` via `withEnvironment`, so cap tests stay small.
- **`defaults(userId)`** — helper that returns only the entries flagged as default.
- **`describe('the one-default invariant')`** — 7 cases: first-entry auto-default, explicit `addressSetDefault` demotes the prior holder, idempotent re-set, 404 on foreign entry, `default: true` on add demotes in the same write, plain edit leaves default untouched, removing the default promotes the oldest remaining entry.
- **`describe('adding an entry that claims the default')`** — 3 cases: demotion on add, `$`-prefixed labels stored as literal text (not pipeline paths), and `createdAt`/`updatedAt` stamped on the book document.
- **`describe('the address-book cap')`** — 4 cases: 409 `ADDRESS_BOOK_FULL` past the cap, re-admission after removal, a 12-way concurrent burst lands at exactly 3, and concurrent `default: true` claims still yield one default.
- **`describe('ownership')`** — 1 case: update and remove on another user's entry both return 404 and leave the owner's data intact.
- **`describe('PII at rest')`** — 3+ cases: raw Mongoose document shows `v\d+` encrypted fields (not plaintext), repository round-trip returns the submitted plaintext, and AAD binding rejects a ciphertext copied to a different entry/field.

## Relationships

- **`src/modules/addresses/service.ts`** — imported as `* as addressService` via relative path (`../../service`); every test action (`addressAdd`, `addressGet`, `addressUpdate`, `addressRemove`, `addressSetDefault`) goes through it.
- **`src/modules/addresses/model.ts`** — imports `addressBookModel` to issue raw `findOne().lean()` queries that bypass the repository's decrypt layer, for the PII-at-rest assertions.
- **`src/modules/addresses/tests/integration/fixtures.ts`** — provides the `HOME` and `OFFICE` address objects used as the two canonical test entries.
- **`src/modules/users/tests/factories.ts`** — provides `createUser()` to mint isolated users per test.
- **`tests/support/environment.ts`** — provides `withEnvironment()` to scope `NODE_ADDRESS_BOOK_MAX` to individual cap tests.
- **`tests/support/response.ts`** — provides `asReject()` to unwrap and assert on the error shape of a rejected service response.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to prepare and tear down the test database.

## Notes

- The service import is deliberately relative (`../../service`), not via the module barrel, per the project's barrel-rule that a module's own tests must not import its `index.ts`.
- `setupTestDb()` is invoked at the top of the module (outside any `beforeAll`), so the DB is ready before the first `describe` block runs.
- The `$`-prefix test is a regression guard: the update pipeline interprets `$`-prefixed strings as field paths, so the service wraps user-supplied labels in `$literal`; this test confirms the label `$items` is stored as-is.
- The PII "at rest" test intentionally reads the Mongoose document directly (`.lean()`) to simulate a raw DB/backup read, bypassing the repository's built-in decryption.
- Cap tests use 12 or 6 concurrent `Promise.all` adds to exercise the filter-based cap under concurrency, not just sequential ordering.
