---
source: src/modules/users/tests/integration/staff-contacts.test.ts
sha256: 530d213130844eccc22b01fe9005a63e5a10ad87afbbb0c909f6c6d0c7f6d684
generated_at: 2026-11-08T08:57:43.708279+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/staff-contacts.test.ts

## Purpose

Integration test for `userService.staffContacts`, verifying that the method returns only those members of a staff notice who can actually act on it—specifically, accounts with an armed authenticator that are neither banned nor deleted.

## Key elements

- **`describe('staffContacts')`** — single test block covering three scenarios:
  - *Armed, live account* — asserts the returned object contains `id`, `email`, and `locale` for a user with `authenticatorEnabledAt` set.
  - *Filtering* — creates four users (armed, unarmed, banned via `active: false`, deleted via `deletedAt`) and asserts only the armed one is returned.
  - *Empty input* — passes `[]` and expects `[]` back, confirming no DB query is issued.

## Relationships

- **`src/modules/users/services/index.ts`** — imports `userService` and calls its `staffContacts` method; this file is the unit under test.
- **`src/modules/users/tests/factories.ts`** — imports the `createUser` factory used to seed test users with specific field overrides (email, locale, `authenticatorEnabledAt`, `active`, `deletedAt`).
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` once at module scope to initialise the in-memory/test database before any test runs.

## Notes

- `setupTestDb()` is invoked at the top level (not inside a `beforeAll` hook), so it runs synchronously at import time; tests assume the DB is ready by the time `describe` callbacks execute.
- The empty-array test doubles as a guard against accidental DB queries for zero-length inputs—useful if the service is refactored.
- The module docblock encodes the domain rule (armed + live ⇒ contactable) as prose; keep it in sync if the filtering logic in `staffContacts` changes.
