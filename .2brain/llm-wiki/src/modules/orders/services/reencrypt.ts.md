---
source: src/modules/orders/services/reencrypt.ts
source_sha256: dd2eaba9d39437122b93fb19b311b82e6740d87030e498914530954c8bddc815
context_sha256: 841248064b0e985e271790b39024179d67869c557a99f905c60cdb89a299fcf4
generated_at: 2026-11-22T06:22:47.162705+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/reencrypt.ts

## Purpose
Re-encrypts all PII stored by the orders module onto the newest `NODE_PII_ENCRYPTION_KEY`: each order's encrypted addresses and notes, plus the text of every staff note on order timelines. It backs the ops script `reencrypt` (see `@infrastructure/security/reencrypt`).

## Key elements
- `fieldsOf(order)` (private): builds the list of `EncryptedField`s for one order. It covers every address path in `ADDRESS_PATHS` and each field returned by `addressFieldsOf(path)`, skipping fields that are `undefined`. It also covers `notes` when present. Each field's binding is `piiBinding(...)` over an AAD tied to the order's `_id` (`addressAad` or `notesAad`). Labels look like `orders.<path>.<field>` and `orders.notes`.
- `noteFieldsOf(event)` (private): returns the single `text` field of an order event, or none if `text` is undefined. Its binding is `timelineNoteAad(String(event.orderId))`, so it is bound to the parent order, and its label is `orderevents.text`.
- `reencryptOrders(dryRun = false)` (exported): runs `orderRepository.reencrypt` with the PII key ring and `fieldsOf`. It then runs `orderEventRepository.reencrypt`, filtered to `{ type: 'note_added', text: { $exists: true } }`, with `noteFieldsOf`. It returns the two reports combined with `mergeReports`. With `dryRun` it counts what a real run would move and writes nothing.

## Relationships
- `@infrastructure/security/reencrypt`: provides `mergeReports` and the `EncryptedField` type that the field builders produce.
- `@infrastructure/security/pii-encryption`: provides `getPiiEncryptionKeyRing()` and `piiBinding`.
- `../pii`: provides the AAD builders (`addressAad`, `notesAad`, `timelineNoteAad`), `ADDRESS_PATHS` and `addressFieldsOf`.
- `../repository`: `orderRepository` and `orderEventRepository` do the actual `reencrypt` work. This file only supplies the key ring, filter and field extractors.
- `../model`: supplies the `OrderDocument` and `OrderEventDocument` types.
- `@types` (`src/types/index.ts`): supplies `OrderBillingAddress`.

## Notes
- The order pass runs first, and the event pass starts only after it resolves. Both are chained as promises.
- Only `note_added` event text is ciphertext. An override's reason is stored as written, so it is not touched.
- Each value's AAD includes the owning order's id, so ciphertexts are bound to their order.
- `vatNumber` exists only on the billing address. The `order[path]` value is typed as `OrderBillingAddress | undefined` so that field can be indexed, and `addressFieldsOf` requests `vatNumber` only for that path.
