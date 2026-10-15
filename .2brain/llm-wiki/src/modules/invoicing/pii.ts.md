---
source: src/modules/invoicing/pii.ts
sha256: 760f52b836f4d666040328355a85784e742f45d42bf06665b10bc2f67d0fd7bc
generated_at: 2026-10-15T10:38:54.247886+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/pii.ts

## Purpose

Encrypts and decrypts the buyer's billing-address fields frozen on an invoice or credit note. The document itself remains the legal copy; only its storage is protected (GDPR Art. 32). It mirrors the orders module's PII codec and shares the same `NODE_PII_ENCRYPTION_KEY` ring.

## Key elements

- **`InvoiceDocumentKind`** (exported type) — `'invoice' | 'credit-note'`. Identifies which collection a document lives in; embedded in the AAD so an invoice's address cannot be substituted as a credit note's (or vice-versa).
- **`PARTY_FIELDS`** (exported const tuple) — `['fullName', 'street', 'city', 'zip', 'country']`. The fixed set of address fields walked in both encrypt and decrypt directions.
- **`partyAad`** (exported function) — Builds the per-field associated-authenticated-data string: `invoicing:<kind>.billingAddress.<field>:<documentId>`. Ties a ciphertext to exactly one field of one document.
- **`mapParty`** (internal helper) — Iterates every `PARTY_FIELDS` entry on an `InvoiceParty` object, applying a `convert` callback and returning a new object. Shared by both directions.
- **`encryptInvoiceParty`** (exported) — Encrypts each address field via `encryptPii`, binding the AAD to the document's pre-allocated `_id`.
- **`decryptInvoiceParty`** (exported) — Reverses the above via `decryptPii`, passing a human-readable label (e.g. `"invoice street"`) as the second argument for error context.

## Relationships

- **`src/infrastructure/security/pii-encryption.ts`** — Provides the `encryptPii` / `decryptPii` primitives this module wraps with invoicing-specific AAD.
- **`src/modules/invoicing/model.ts`** — Source of the `InvoiceParty` type that both directions operate on.
- **`src/modules/invoicing/services/issue-invoice.ts`** — Writes: calls `encryptInvoiceParty` before inserting a new invoice.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — Writes: calls `encryptInvoiceParty` before inserting a new credit note.
- **`src/modules/invoicing/services/render.ts`** — Reads: the sole consumer of `decryptInvoiceParty`, the one place plaintext is needed for output.
- **`src/modules/invoicing/services/reencrypt.ts`** — Reads/writes: uses both functions to re-encrypt stored parties (e.g. after a key rotation).
- **Tests** (`issue-invoice.test.ts`, `issue-credit-note.test.ts`, `reencrypt.test.ts`) — Integration coverage exercising the encrypt/decrypt round-trip through the issuing and re-encryption flows.

## Notes

- The `_id` is **pre-allocated before the insert**; `encryptInvoiceParty` expects it as a `Types.ObjectId`, not a string. Forgetting this breaks the AAD binding.
- `PARTY_FIELDS` is a `const` tuple, so adding a field to `InvoiceParty` without updating the tuple will silently skip that field in both directions.
- The AAD string format (`invoicing:<kind>.billingAddress.<field>:<id>`) is load-bearing: changing it invalidates every existing ciphertext.
