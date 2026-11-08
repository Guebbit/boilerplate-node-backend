---
source: src/modules/orders/services/reencrypt.ts
sha256: ded9f0bd4eeff0494694c234f58d36ac394d6509144663b594cbcb26dece6a93
generated_at: 2026-11-08T06:59:58.846953+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/reencrypt.ts

## Purpose

Re-encrypts all PII ciphertext in order documents (postal addresses, free-text notes) and in timeline staff notes onto the newest key in the PII encryption key ring. Serves as the orders-domain half of the ops-level key-rotation script (see `@infrastructure/security/reencrypt`).

## Key elements

- **`fieldsOf(order: OrderDocument): EncryptedField[]`** – Enumerates every encrypted sub-field of one order (each address path × each postal field, plus `notes`), returning the stored ciphertext, its dotted path, a label, and an AAD binding derived from the order's `_id`.
- **`noteFieldsOf(event: OrderEventDocument): EncryptedField[]`** – Returns the single encrypted `text` field of a timeline note, bound to `event.orderId` via `timelineNoteAad`.
- **`reencryptOrders(dryRun?: boolean)`** *(exported)* – Drives the two-phase re-encryption: calls `orderRepository.reencrypt` for all orders, then `orderEventRepository.reencrypt` filtered to `{ type: 'note_added', text: { $exists: true } }`, and finally merges the two reports with `mergeReports`. Passes the live key ring from `getPiiEncryptionKeyRing()`.

## Relationships

- **`@infrastructure/security/reencrypt`** – Supplies the `EncryptedField` type and `mergeReports` used to combine order and event reports.
- **`@infrastructure/security/pii-encryption`** – Provides `getPiiEncryptionKeyRing` (the target key ring) and `piiBinding` (wraps an AAD into the binding shape the repository expects).
- **`@domain-primitives/postal-address`** – Supplies `POSTAL_ADDRESS_FIELDS`, the canonical list of sub-fields within each address path.
- **`../pii`** – Provides `ADDRESS_PATHS`, `addressAad`, `notesAad`, and `timelineNoteAad`; these define the AAD material that makes each ciphertext non-portable outside its context.
- **`../model`** – Source of the `OrderDocument` and `OrderEventDocument` types consumed by the field-mapping functions.
- **`../repository`** – `orderRepository` and `orderEventRepository` expose the `.reencrypt()` method that performs the actual read-rewrite loop; this file only supplies the config (key ring, field mapper, filter).
- **`./index`** (services barrel) – Re-exports `reencryptOrders` for external consumers.

## Notes

- Timeline re-encryption is scoped to `type: 'note_added'` events only; other event types (e.g. an override's `reason`) are stored as plain text and are **not** treated as ciphertext.
- AAD bindings are per-document: address/note fields bind to the order `_id`, while timeline notes bind to `event.orderId`. This means a field cannot be decrypted under a different document ID even with the correct key.
- Execution is sequential (orders → events → merge); there is no parallelism or batching visible here—those concerns live in the repository `.reencrypt` implementations.
- `dryRun` short-circuits writes at the repository layer; this file simply forwards the flag.
