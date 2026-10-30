---
source: tests/integration/erasure.test.ts
sha256: fb9b9fe982aeabbeb6adb21c5b6019aaa12cb01500dc053fc9859eaa07c36247
generated_at: 2026-10-29T06:55:25.719690+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/erasure.test.ts

## Purpose

Integration test that executes the real hard-delete (GDPR Art. 17) cascade and a scheduled self-deletion, asserting which data is removed and which is legally retained. Unlike `personal-data-erasure.test.ts` (which only verifies a hook is declared), this file runs the full write path—purchase, refund, return, ticket—then confirms the cascade deletes personal data (address book, tickets, sessions, API keys, carts, etc.) while preserving tax-mandated records (invoices, credit notes, returns, paid orders).

## Key elements

- **`FAKE_SUCCESS_METHOD`** – Payment-method constant (`pm_card_visa`) matching the fake PSP double, used to confirm payments in-test.
- **`textOf(value)`** – Serialises a document to lower-cased JSON string so a deep scan can match a user ID whether stored as hex string or ObjectId.
- **`collectionsNaming(needles)`** – Iterates **every** collection in the connected Mongo database and returns the sorted list of collection names containing at least one document whose JSON text matches any needle. Catches collections no one explicitly tracked.
- **`KEPT_BY_LAW`** – Const map of collection name → legal justification (Art. 6, Art. 17(3)(b), Art. 19, outbox retention). Acts as the allow-list the second test asserts against. Adding an entry is a conscious decision to retain personal data.
- **`describe('a hard delete of an account…')`** – Seeds a user with an address, a paid order, a refund/credit note, a return, and a ticket. Calls `userService.removeById(…, true, …)`. Asserts user, address book, and ticket are gone; invoices, credit notes, and returns remain.
- **`describe('a scheduled self-deletion…')`** – Seeds data across many modules (cart, wishlist, stock alerts, notifications, sessions, reset tokens, API keys, webhook subscriptions, translations, a second user's `purchaseHold`, paid/unpaid orders, return, ticket). After the purge, asserts `collectionsNaming` returns **only** the collections listed in `KEPT_BY_LAW`.

## Relationships

- **`src/kernel/access/tenant.ts`** – Imports `DEPLOYMENT_TENANT_ID` to scope the API-key mint call to the correct tenant.
- **`src/kernel/events.ts`** – Calls `resetDomainEvents()` in `afterEach` to isolate event-bus state between tests.
- **`src/kernel/permissions.ts`** – Imports `permissionsOfRole` to build a realistic caller context for the API-key creation.
- **`src/modules/access/module.ts`** – Registered via `registerCheckoutModules` so access-control middleware is active during the cascade.
- **`src/modules/account/services/index.ts`** – Imports `accountService` (exposed for potential future assertions on account state post-erasure).
- **`src/modules/account/tests/factories.ts`** – `plantSession` and `plantToken` seed session and password-reset documents that must be wiped.
- **`src/modules/addresses/model.ts`** – `addressBookModel` used to assert addresses are deleted.
- **`src/modules/addresses/module.ts`** – Registered in the module graph for the checkout pipeline.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` creates a test address document.
- **`src/modules/api-keys/module.ts`** – Registered; its API-key documents must be purged.
- **`src/modules/api-keys/services/api-keys.ts`** – `mint` creates an API key owned by the test user to verify it is removed.
- **`src/modules/cart/services/index.ts`** – `cartService.addItemById` seeds a cart line that must be deleted.
- **`src/modules/example/module.ts`** – Registered; `createExample` (from its factories) seeds a row that must be purged.
- **`src/modules/example/tests/factories.ts`** – `createExample` creates a document referencing the user.
- **`src/modules/invoicing/model.ts`** – `invoiceModel` and `creditNoteModel` used to assert tax records survive the delete.

## Notes

- **`collectionsNaming` is intentionally exhaustive.** It reads every collection, so a new module that writes a user reference is caught automatically. This is the mechanism that makes the second test a regression guard against an "erase everything" refactor that accidentally touches a tax record, *and* against a new module that forgets to participate in the cascade.
- **`KEPT_BY_LAW` is a policy list, not a test helper.** The docstring explicitly states that adding an entry is a legal/retention decision. Treat it as code-reviewed policy.
- **`eventually()` is used for async settlement** (invoice/credit-note creation after payment/refund). Do not replace with a fixed sleep.
- **The second test seeds a second user's `purchaseHold.setBy`** to verify that a cross-user reference (staf member who set a hold) is also scrubbed, not just the owner's own rows.
- **`textOf` lower-cases and stringifies** so the scan is case-insensitive and matches both raw hex IDs and embedded ObjectId serialisations.
