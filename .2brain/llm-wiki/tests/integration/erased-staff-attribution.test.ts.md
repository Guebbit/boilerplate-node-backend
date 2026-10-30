---
source: tests/integration/erased-staff-attribution.test.ts
sha256: 7a57f53caf09ec5d488ade284962cd3f91b5e4cf6821e81c84ee0b49203c2107
generated_at: 2026-10-29T06:55:07.285925+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/erased-staff-attribution.test.ts

## Purpose

Integration tests that verify the data-integrity guarantee for staff-account erasure: when a manager-level staff member is purged, the business records they authored (webhook subscriptions, translations, purchase holds) remain functional but lose their person-reference field. The tests exercise the real `eraseAsScheduled` cascade against a live test database.

## Key elements

- **`describe('erasing a staff account')`** — the single suite containing three sibling tests, each following the pattern: create staff → create attributed record → `eraseAsScheduled(staff)` → assert record survives with the owner field `undefined`.
- **Test 1 — webhook subscription**: creates a subscription via `webhookSubscriptionRepository.create` with `ownerUserId` set, then asserts the row is still found but `ownerUserId` is `undefined`.
- **Test 2 — translation**: upserts a human-originated locale row via `translationRepository.upsertEntityLocale` with `staff.id` as translator, then asserts `translatedBy` is `undefined` while `fields` content is intact.
- **Test 3 — purchase hold**: creates a buyer whose `purchaseHold.setBy` points at the staff user, then asserts `reason` and `until` persist while `setBy` is `undefined`.
- **`beforeEach`** — registers `webhooksModule` and `localesModule` as checkout modules so their repositories are reachable.
- **`afterEach`** — calls `resetDomainEvents()` to drain the event queue between tests.

## Relationships

- **`src/modules/users/tests/factories.ts`** — source of `createUser`, `eraseAsScheduled`, and `userRepository`; the core action under test is `eraseAsScheduled`.
- **`src/modules/webhooks/repository.ts`** — provides `webhookSubscriptionRepository` used to create and re-fetch the subscription row.
- **`src/modules/webhooks/secrets.ts`** — provides `mintRingSecret` to generate a valid secret entry for the subscription fixture.
- **`src/modules/webhooks/module.ts`** — registered in `beforeEach` so its repository is wired into the checkout container.
- **`src/modules/locales/repository.ts`** — provides `translationRepository` for the translation upsert/re-fetch.
- **`src/modules/locales/module.ts`** — registered in `beforeEach` alongside the webhooks module.
- **`src/modules/users/repository.ts`** — `userRepository.findById` re-fetches the buyer to inspect the purchase-hold fields.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears any domain events emitted during the erase cascade between tests.
- **`src/types/index.ts`** — supplies the `TranslationOrigin.human` enum used in the translation fixture.
- **`tests/support/callers.ts`** — provides `TEST_TENANT_ID` for all fixture records.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires modules into the test container.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory/database test environment.

## Notes

- The design contract (stated in the file header comment) mirrors the order-timeline actor rule: the record outlives the person; only the identity pointer is removed.
- All three assertions use `toBeUndefined()` rather than `toBeNull()` — the erase cascade deletes the key rather than setting it to `null`.
- `eraseAsScheduled` (not a hard delete) is the entry point; it is the "purge door" the header comment refers to.
- The purchase-hold test stores the attribution on the **buyer's** document (`purchaseHold.setBy`), not in a separate table, so the assertion reads back from `userRepository`.
