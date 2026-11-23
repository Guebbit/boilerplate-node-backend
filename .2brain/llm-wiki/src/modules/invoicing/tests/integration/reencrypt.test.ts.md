---
source: src/modules/invoicing/tests/integration/reencrypt.test.ts
source_sha256: f12acc7c889a8390dcdf41a6562a9426283c67174618073c5b782fd2f3ca8b26
context_sha256: b898ba510b30275fbfb8f18abc513936cd4ab028e9945d2cf967815b1165d771
generated_at: 2026-11-22T05:39:12.121001+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/integration/reencrypt.test.ts

## Purpose
Integration test for the invoicing module's `reencrypt` walk. It checks that the buyer billing address frozen on an invoice is rewritten from the old PII key to the newest key, that it still decrypts using the invoice's own id, and that a second run is a no-op.

## Key elements
- `setupTestDb()` — sets up the test database for the suite.
- `beforeEach` — registers the users, products, inventory, orders and invoicing modules via `registerModules`.
- `afterEach` — calls `resetDomainEvents()` to clear domain events between tests.
- Single test, `moves the buyer address to the newest key, and a second run changes nothing`:
  - Creates a user, a product (price `10.00`) and an order with a full billing address (including `vatNumber`).
  - Calls `markPaid` on the order, then `waitForInvoice` to wait for the invoice to be generated.
  - Under `withEnvironmentOverrides`, sets `NODE_PII_ENCRYPTION_KEY` to `v2:new-pii-key-material,v1:test-pii-encryption-key`.
  - Asserts that the first `invoicingModule.reencrypt(false)` returns `rewritten === 6`, and the second returns `0`.
  - Reads the raw invoice via `invoiceModel` and asserts `keyVersionOf(billingAddress.city)` is `'v2'`.
  - Asserts that `decryptInvoiceParty(billingAddress, 'invoice', invoice._id)` returns the original `city` (`London`) and `vatNumber` (`GB123456789`).

## Relationships
- `@kernel/registry` (`registerModules`) and `@kernel/events` (`resetDomainEvents`) handle module wiring and event cleanup.
- Registers the `users`, `products`, `inventory`, `orders` and `invoicing` modules. Invoicing is the module under test (`reencrypt`).
- `orders/friends/payments` (`markPaid`) is what triggers invoice creation. `waitForInvoice` from `invoicing/tests/factories` waits for the result.
- Uses the `products`, `users` and `orders` test factories (`createProduct`, `createUser`, `createOrder`, `toOrderItem`) to build the data.
- `invoicing/model` (`invoiceModel`) is used to read the stored document directly.
- `invoicing/pii` (`decryptInvoiceParty`) is used to verify decryption.
- `infrastructure/security/versioned-secret` (`keyVersionOf`) reads the key version of an encrypted field.

## Notes
- The expected `rewritten` count of `6` is hard-coded. The test does not say which fields it covers.
- The old key `v1:test-pii-encryption-key` stays in the rotation string so existing data can still be decrypted. `v2` is listed first and is the key the test expects after re-encryption.
- The `false` argument to `reencrypt` is not explained in the file.
- Decryption is bound to the invoice id, passed as the `'invoice'` context plus `_id`.
