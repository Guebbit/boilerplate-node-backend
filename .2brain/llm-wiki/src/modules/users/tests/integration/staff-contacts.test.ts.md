---
source: src/modules/users/tests/integration/staff-contacts.test.ts
sha256: 530d213130844eccc22b01fe9005a63e5a10ad87afbbb0c909f6c6d0c7f6d684
generated_at: 2026-10-29T06:23:23.885039+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/staff-contacts.test.ts

## Purpose

Integration tests for `userService.staffContacts`, which filters a list of member IDs down to those who can actually act on a staff notice. The rule under test: a contact must have an armed authenticator and must not be banned (`active: false`) or deleted (`deletedAt` set). The file exists to lock in that filtering logic end-to-end against a real database.

## Key elements

- **`describe('staffContacts')`** — single test block covering three scenarios:
  - *Armed, live account* — asserts the returned object shape is exactly `{ id, email, locale }`.
  - *Mixed cohort* — seeds armed, unarmed, banned, and deleted users; asserts only the armed one survives the filter.
  - *Empty input* — asserts `[]` resolves to `[]` without touching the database.
- **`createUser(...)`** — factory call used to build each fixture inline; no additional helpers are defined in this file.
- **`setupTestDb()`** — called once at module level to provision the test database before any test runs.

## Relationships

- **`src/modules/users/services/index.ts`** — the unit under test. `userService.staffContacts(ids)` is the sole method exercised.
- **`src/modules/users/tests/factories.ts`** — provides `createUser`, the only fixture builder used here.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which configures the integration-test database before the suite runs.

## Notes

- The module docblock encodes the business rule in prose ("a staff role is withheld without an armed authenticator…"); treat it as the spec, not just a comment.
- The empty-array test is intentionally a guard against an unnecessary `SELECT` on `[]` input; if the service changes to always query, this test will flag it.
- `locale` is included in the expected output, so any change to the return shape (e.g., adding a field or dropping one) breaks the first test.
