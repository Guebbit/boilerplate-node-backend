---
source: src/modules/invoicing/tests/integration/reencrypt.test.ts
sha256: cd772d7206c37c76802141f4b4d4eff8404181c00078b5ca60a557c52a54b5ef
generated_at: 2026-11-14T20:16:01.531811+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/reencrypt.test.ts

## Purpose

Integration test that verifies the invoicing module's `reencrypt` walk: when the PII encryption key is rotated (a new key is prepended to the `NODE_PII_ENCRYPTION_KEY` environment variable), the buyer address fields stored on an invoice are re-encrypted under the new key version, remain decryptable under the invoice's own id, and a second invocation is a no-op (idempotency).

## Key elements

- **`describe('invoicing reencrypt')`** — single test block exercising key rotation end-to-end against a real (test) database.
- **`invoicingModule.reencrypt(false)`** — the function under test; called twice to assert migration then idempotency. Returns an object with a `rewritten` count.
- **`withEnvironmentOverrides`** — wraps the test body so `NODE_PII_ENCRYPTION_KEY` is set to a two-version rotation string (`v2:…,v1:…`) without mutating the process environment permanently.
- **`keyVersionOf(raw.billingAddress.city)`** — asserts the stored ciphertext now carries the `v2` prefix.
- **`decryptInvoiceParty(raw.billingAddress, 'invoice', raw._id)`** — confirms the re-encrypted fields still decrypt to the original plaintext using the invoice id as the decryption key.
- **`markPaid` → `waitForInvoice`** — trigger path: marking the order paid causes the invoicing module to emit an invoice, which the test then polls for.
- **`setupTestDb()` / `registerModules` / `resetDomainEvents`** — standard integration-test scaffolding (clean DB per run, full module graph registered, event bus reset between tests).

## Relationships

- **`src/modules/invoicing/module.ts`** — provides `reencrypt`, the function being tested.
- **`src/modules/invoicing/pii.ts`** — provides `decryptInvoiceParty` used to verify decryption correctness.
- **`src/modules/invoicing/model.ts`** — provides `invoiceModel`, used to read the raw stored ciphertext from the database.
- **`src/infrastructure/security/versioned-secret.ts`** — `keyVersionOf` extracts the key-version prefix from a ciphertext blob.
- **`src/kernel/registry.ts`** — `registerModules` wires all modules into the in-process service registry for the test.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the event bus between test cases.
- **`src/modules/orders/friends/payments.ts`** — `markPaid` is the action that triggers invoice creation.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build the order fixture.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the product fixture.
- **`src/modules/invoicing/tests/factories.ts`** — `waitForInvoice` polls until the asynchronously created invoice is queryable.
- **`src/modules/users/module.ts`, `src/modules/products/module.ts`, `src/modules/inventory/module.ts`, `src/modules/orders/module.ts`** — registered alongside the invoicing module so cross-module event resolution works correctly.

## Notes

- The expected `rewritten` count of **5** corresponds to the five billing-address fields (`fullName`, `street`, `city`, `zip`, `country`). If the schema gains or loses a PII field, this assertion will need updating.
- The rotation string order matters: the **first** entry is the *newest* key. The test asserts migration to `v2`, i.e. the leading version.
- The `false` argument to `reencrypt` is not further documented in this file; it likely toggles a "force" or "dry-run" mode. Check `module.ts` for the parameter contract.
