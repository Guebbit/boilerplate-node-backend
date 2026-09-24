---
source: src/modules/orders/model.ts
sha256: d90132e99b4931a17890cdf91024bc8eab9a96a658aa433f9664ea5221fedd74
generated_at: 2026-09-23T19:04:02.550466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/model.ts

## Purpose

Defines the Mongoose schema and TypeScript document interface for order records, plus the serialization transform that derives wire-only fields (`totalItems`, `totalQuantity`, `totalPrice`, `transferInstructions`) at read time. Orders embed a frozen product snapshot (not a `ref`) so that later catalogue edits never rewrite purchase history, and the snapshot is deliberately narrower than the live `productSchema` — no stock counters, no image URLs, and a resolved `taxRate` instead of a `taxClass`.

## Key elements

- **`FrozenOrderLineProduct`** — `ProductSnapshot` minus `taxClass`, plus a resolved `taxRate: number`. The unit of what an order line freezes.
- **`OrderDocumentItem`** — shape of one embedded line: `product` (snapshot), `quantity`, `locale` (the language `title`/`description` were resolved into at freeze time).
- **`OrderPendingEffect`** — union type currently containing only `'refund'`; tracks post-cancel work the event bus could not guarantee.
- **`OrderDocument`** — full document interface extending `Order` (contract type) and Mongoose `Document`; overrides `userId?`, `status`, `items`, timestamps, and adds `anonymizeAfter`, `pendingEffects`, `transferReference`, `statusOverrides`, `invoiceNumber`.
- **`OrderStatusOverride`** — one admin override event (`from`, `to`, `mode`, `reason`, `actorUserId`, `at`); appended by `services/override.ts`, never reordered or deleted.
- **`OrderModel`** — `Model<OrderDocument>` type alias for use in repositories/services.
- **`orderLineProductSchema`** — embedded sub-document schema for the snapshot; no `onHand`/`reserved`, no image URLs; carries `taxRate` instead of `taxClass`. `{ timestamps: true }`.
- **`applyOrderLineProductTransform`** — `applySerialization(orderLineProductSchema)`; maps `_id`→`id`, drops `__v`; no `available` derivation (no stock fields to compute from).
- **`orderItemSchema`** — embedded item schema (`_id: false`); composes `orderLineProductSchema` + `quantity` + `locale`.
- **`orderSchema`** _(truncated)_ — top-level Mongoose schema for the order collection; its companion transform uses `sumLineItems`/`orderTotal`/`orderTaxBreakdown`/`bankTransfer*` config to derive the wire fields.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, the generic mechanism used to build both the order-level and line-product-level transforms.
- **`src/modules/orders/config.ts`** — supplies `bankTransferBeneficiary`, `bankTransferBic`, `bankTransferIbanFriendly`; consumed by the order transform to build the `transferInstructions` block on the wire.
- **`src/modules/orders/domain/totals.ts`** — supplies `sumLineItems`, `orderTotal`, and the `LineItem` type; used at serialization to derive `totalItems`, `totalQuantity`, `totalPrice`.
- **`src/modules/orders/domain/tax.ts`** — supplies `orderTaxBreakdown` and `TaxableLineItem`; used to compute the VAT breakdown included in the serialized response.
- **`src/modules/orders/domain/lifecycle.ts`** — supplies `isPayable`; referenced in schema/model logic around `payBy` and status transitions.
- **`src/modules/orders/factories.ts`** — constructs `OrderDocument` instances against this schema; explicitly sets sub-document `createdAt`/`updatedAt` because `orderLineProductSchema` carries `{ timestamps: true }`.
- **`src/modules/orders/repository.ts`** — the sole query layer for `OrderModel`; all persistence reads/writes go through it rather than this file directly.
- **`src/modules/orders/services/cancel.ts`** — writes `pendingEffects: ['refund']` in the same conditional write that flips status; the `retryPendingEffects` loop later empties it.
- **`src/modules/orders/index.ts`** — public barrel re-exporting the types and schema from this module.
- **`src/modules/cart/services/checkout.ts`** — creates new order documents (the write path that populates the embedded snapshot).

## Notes

- **No `ref`, no `populate`.** `orderItemSchema` declares `product: orderLineProductSchema` with no `ref`; there is nothing to join and no un-joined state to handle.
- **`locale` lives on the item, not the product.** It describes the resolution context of the whole line, not a product attribute. Reading an order must not re-resolve text against the reader's ambient locale.
- **`taxRate` is frozen, `taxClass` is not stored.** The schema makes the class unreachable; only the resolved decimal rate persists.
- **Derived fields are never persisted.** `totalItems`, `totalQuantity`, `totalPrice`, `transferInstructions` exist only in the serialized output via the transform; declaring them on `OrderDocument` would falsely imply a stored column.
- **`transferReference` is intentionally omitted from the wire** by `applyOrderTransform`; it is surfaced only inside `transferInstructions.reference`.
- **`anonymizeAfter` / `pendingEffects` / `transferReference` / `statusOverrides`** are all omitted from the contract `Order` type and from the wire transform — they are operational metadata, not part of the API.
- **`statusOverrides` is absent (not `[]`) until first written.** Same "owes nothing vs. never asked" convention as `pendingEffects`.
- **`userId` is optional** on the document: an erased account leaves a dangling ref that is _intended_ (Art. 17(3)(b)/(e) invoice survival), not a bug.
- **`_id: false` on `orderItemSchema`** — the OpenAPI `OrderItem` contract is `{product, quantity}` with `additionalProperties: false`, so items carry no internal id.
