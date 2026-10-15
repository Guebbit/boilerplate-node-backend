---
source: src/modules/invoicing/tests/integration/reencrypt.test.ts
sha256: c3ae048e26f54cda5dad4820853f5f88a1b11712e72a66acacc9aa801262e241
generated_at: 2026-10-15T10:40:27.547001+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/reencrypt.test.ts

## Purpose

Integration test that verifies the invoicing module's `reencrypt` walk: when the PII encryption key is rotated, buyer address fields frozen on an invoice are re-encrypted under the newest key, remain decryptable via the invoice's own ID, and a subsequent no-op run reports zero rewrites.

## Key elements

- **`waitForInvoice(orderId, timeoutMs?)`** — polling helper that retries `invoicingRepository.findInvoiceByOrderId` every 10 ms until the invoice exists or a 2 s timeout is hit. Used to bridge the fire-and-forget `ORDER_STATUS_CHANGED` event listener that creates the invoice asynchronously after `markPaid`.
- **`describe('invoicing reencrypt')` / single `it` block** — sets up a user, product, and order with a billing address; marks the order paid; waits for the invoice; then inside `withEnvironment('NODE_PII_ENCRYPTION_KEY', rotation, …)` calls `invoicingModule.reencrypt(false)` twice and asserts:
  - first call rewrites 5 PII fields, second call rewrites 0 (idempotency),
  - `versionOf(raw.billingAddress.city)` returns `'v2'` (newest key tag),
  - `decryptInvoiceParty(…, 'invoice', id).city` still yields the original plaintext.
- **`beforeEach` / `afterEach`** — registers the five modules (users, products, inventory, orders, invoicing) into the kernel registry and resets domain events after each test.

## Relationships

- **`src/kernel/registry.ts`** — `registerModules` is called in `beforeEach` to wire all five modules before each test.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-memory event bus in `afterEach`.
- **`src/modules/invoicing/module.ts`** — the system under test; its exported `reencrypt` method is invoked and its return value is asserted.
- **`src/modules/invoicing/pii.ts`** — provides `decryptInvoiceParty`, used to confirm the re-encrypted field still decrypts to the original address.
- **`src/modules/invoicing/model.ts`** — `invoiceModel` is queried directly (Mongoose `findById`) to inspect the raw stored PII and its version tag.
- **`src/modules/invoicing/repository.ts`** — `invoicingRepository.findInvoiceByOrderId` is the lookup used by `waitForInvoice`.
- **`src/infrastructure/security/versioned-secret.ts`** — `versionOf` extracts the key-version prefix from a ciphertext blob to assert the field was rewritten under `v2`.
- **`src/modules/orders/index.ts`** — `markPaid` triggers the event that causes the invoice to be created.
- **`src/modules/orders/module.ts`**, **`src/modules/products/module.ts`**, **`src/modules/inventory/module.ts`** — registered so their event listeners and repositories are available during the test.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build the fixture order with a billing address.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the line-item product.

## Notes

- The rotation string format is `v2:new-key,v1:old-key`; the module under test is expected to pick the highest version as the "newest."
- The test relies on a **fire-and-forget** event listener (order-status → invoice creation), which is why the polling helper exists; there is no synchronous await on the listener.
- `invoicingModule.reencrypt(false)` — the boolean argument appears to be a "dry-run" flag (not exercised here, but the test always passes `false`).
- The expected rewrite count of **5** corresponds to the five billing-address sub-fields (`fullName`, `street`, `city`, `zip`, `country`) that are individually PII-encrypted.
