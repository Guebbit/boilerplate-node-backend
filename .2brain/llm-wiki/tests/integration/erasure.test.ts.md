---
source: tests/integration/erasure.test.ts
sha256: 9577ca64c7c4ce96f1ff953494d9f7f9e5c21bb2aa4b1b03ed16cffccfffc7bb
generated_at: 2026-11-08T09:38:45.050305+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/erasure.test.ts

## Purpose

Integration test for the GDPR Art. 17 hard-delete cascade. It verifies two things: (1) a hard delete removes personal data (address book, contact tasks) while preserving tax-mandated records (invoices, credit notes, returns), and (2) after a scheduled self-deletion, no MongoDB collection still names the account except those the law permits the shop to retain. Unlike `personal-data-erasure.test.ts` (which only asserts a hook is declared), this test exercises the real cascade end-to-end.

## Key elements

- **`textOf`** — Flattens a document via `JSON.stringify(...).toLowerCase()` so a deep string scan catches both string and ObjectId references.
- **`collectionsNaming(needles)`** — Iterates *every* collection in the test database and returns the names of collections whose documents contain any of the given needles (user-id hex or email). Acts as a safety net against forgotten personal-data stores.
- **`KEPT_BY_LAW`** — A `const` mapping of collection names to the legal reason they may retain account identifiers (e.g. `invoices: 'tax law'`, `erasureledgers: 'erasure proof, outlives backups'`). Adding an entry is a conscious retention decision, not a test workaround.
- **`FAKE_SUCCESS_METHOD`** — `'pm_card_visa'`, the reference the fake PSP factory always treats as a successful card payment.
- **First `describe` block** — Seeds a user with an address, a paid order, a refund, a return, and a task. Calls `userService.removeById(id, true, adminCaller)` (the `true` flag triggers hard delete) and asserts the user, address book, and task are gone while invoice, credit note, and return remain.
- **Second `describe` block** — Seeds a "full life" (cart item, wishlist entry, stock alert, notification, session, password-reset token, example record, API key, webhook subscription, translation, purchase-hold on another user, two orders, a paid invoice, a return, a task). Verifies that before the purge the needles are found in a broad set of collections, then runs the scheduled self-deletion and asserts only `KEPT_BY_LAW` collections still name the account.

## Relationships

- **`src/kernel/access/tenant.ts`** — Imports `DEPLOYMENT_TENANT_ID` to scope the API-key minting call.
- **`src/kernel/events.ts`** — Imports `resetDomainEvents`, called in `afterEach` to clear the in-memory event bus between tests.
- **`src/kernel/permissions.ts`** — Imports `permissionsOfRole('admin')` to build the caller context for API-key creation.
- **`src/modules/access/module.ts`** — Registered in `beforeEach` via `registerCheckoutModules`.
- **`src/modules/account/services/index.ts`** — Imports `accountService` (used for the scheduled self-deletion path in the second block).
- **`src/modules/account/tests/factories.ts`** — Imports `plantSession` and `plantToken` to seed auth artifacts.
- **`src/modules/addresses/model.ts`** — Imports `addressBookModel` to assert pre/post-delete counts.
- **`src/modules/addresses/module.ts`** — Registered in `beforeEach`.
- **`src/modules/addresses/tests/factories.ts`** — Imports `giveAddress` to seed an address book entry.
- **`src/modules/api-keys/module.ts`** — Registered in `beforeEach`.
- **`src/modules/api-keys/services/api-keys.ts`** — Imports `mint` to create an API key owned by the test user.
- **`src/modules/cart/services/index.ts`** — Imports `cartService` to add a cart item during seeding.
- **`src/modules/example/module.ts`** — Registered in `beforeEach`.
- **`src/modules/example/tests/factories.ts`** — Imports `createExample` to seed a record in the `examples` collection.
- **`src/modules/invoicing/model.ts`** — Imports `invoiceModel` and `creditNoteModel` to assert legal records survive the delete.

## Notes

- `collectionsNaming` performs a full scan of **all** collections (`find({}).toArray()` on each). This is intentional: it catches personal data in collections the test author did not explicitly account for. It is expensive but only runs once per test.
- The `KEPT_BY_LAW` list is the single source of truth for "which collections may legally retain an account reference." If a new module stores user identifiers, it must either appear here (with a legal justification comment) or be purged by the cascade.
- The second test block seeds data *before* asserting the pre-purge state contains the needles, so a vacuous "nothing was found" cannot pass the post-purge check.
- `eventually` is used for assertions that depend on asynchronous domain-event processing (e.g. invoice creation after payment confirmation).
