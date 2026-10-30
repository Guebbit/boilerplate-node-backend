---
source: src/modules/invoicing/tests/integration/reencrypt.test.ts
sha256: a0d735e636f2881ed9816b2cdeb423c9af2df80ce6cea5565fbe517249955239
generated_at: 2026-10-29T04:17:48.474169+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/reencrypt.test.ts

## Purpose

Integration test that verifies the invoicing module's `reencrypt` walk correctly migrates a buyer's PII fields (billing address) from an old encryption key to the newest key after a key rotation, that the operation is idempotent, and that the migrated data still decrypts under the invoice's own ID.

## Key elements

- **`describe('invoicing reencrypt')`** — single test suite.
- **`it('moves the buyer address to the newest key…')`** — the sole test case. Sets up a user → product → paid order → invoice, then simulates a two-version key rotation via `NODE_PII_ENCRYPTION_KEY` and asserts:
  - First `invoicingModule.reencrypt(false)` call rewrites 5 fields (the billingAddress sub-fields).
  - Second call rewrites 0 (idempotency).
  - `keyVersionOf` on the raw `city` field returns `'v2'`.
  - `decryptInvoiceParty` still yields the original plaintext (`'London'`).
- **`beforeEach`** — registers the full module graph (users, products, inventory, orders, invoicing).
- **`afterEach`** — calls `resetDomainEvents()` to clear the in-memory event bus between tests.
- **`withEnvironmentOverrides`** — scopes the rotated key string to the test body only.

## Relationships

- **`@infrastructure/security/versioned-secret`** — provides `keyVersionOf`, used to assert the new key-version stamp on the ciphertext.
- **`@kernel/registry`** — `registerModules` wires the module dependency graph for each test.
- **`@kernel/events`** — `resetDomainEvents` prevents event leakage across tests.
- **`@modules/invoicing/module`** — the SUT; the test calls `invoicingModule.reencrypt(false)`.
- **`@modules/invoicing/model`** — `invoiceModel.findById` reads the raw (encrypted) document to inspect key-version stamps.
- **`@modules/invoicing/pii`** — `decryptInvoiceParty` performs the round-trip decryption check.
- **`@modules/invoicing/tests/factories`** — `waitForInvoice` polls for the async invoice creation triggered by order payment.
- **`@modules/orders` (index) / `@modules/orders/services`** — `orderService.markPaid` is the trigger that causes the invoice to be created.
- **`@modules/orders/tests/factories`** — `createOrder`, `toOrderItem` build the order fixture.
- **`@modules/products/tests/factories`** — `createProduct` builds the product fixture.
- **`@modules/users/tests/factories`** — `createUser` builds the buyer fixture.
- **`@modules/users|products|inventory/orders module`** — registered so their event handlers and model hooks are active during the test.

## Notes

- The rotation string format is **newest-first, comma-separated** version-prefixed key material (`'v2:…,v1:…'`). The test hard-codes a two-version rotation.
- `reencrypt(false)` — the boolean argument's semantics are not documented in this file; the test only exercises the `false` path. Check the invoicing module for the parameter contract.
- The expected `rewritten` count of **5** corresponds to the five billing-address sub-fields (`fullName`, `street`, `city`, `zip`, `country`); it is not a row count.
- This is an integration test: it hits a real test database (`setupTestDb`) rather than mocking the model layer.
