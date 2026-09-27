---
source: src/modules/orders/model.ts
sha256: d33417d7b9f37d8a345db3790b1e2d44a53b72640d642e0fb8385f4ee87b7728
generated_at: 2026-09-27T15:11:28.602660+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/model.ts

## Purpose

Defines the Mongoose schema for the Order document and the serialization transform (`applyOrderTransform`) that derives wire-only fields (totals, transfer instructions) from embedded items at the single serialization choke-point. The schema embeds a frozen product snapshot per line rather than referencing the live catalogue, ensuring purchase history is immutable.

## Key elements

- **`FrozenOrderLineProduct`** — `ProductSnapshot` minus `taxClass`, plus the resolved decimal `taxRate`. Freezes the rate actually charged, never the class it came from.
- **`OrderDocumentItem`** — shape of one embedded line: `product` (snapshot), `quantity`, `locale` (language the text was resolved into at purchase time).
- **`OrderPendingEffect`** — currently `'refund'` only; tracks a cancel consequence not yet completed so it can be retried.
- **`OrderDocument`** — full document interface. Omits `totalItems`, `totalQuantity`, `totalPrice`, `transferInstructions` (derived, not stored); redeclares `userId` as optional (absent after account erasure); adds `anonymizeAfter`, `pendingEffects`, `transferReference`, `statusOverrides`, `currency`, `orderNumber`.
- **`OrderStatusOverride`** — one admin override entry (`from`, `to`, `mode`, `reason`, `actorUserId`, `at`). Append-only, never reordered or deleted.
- **`OrderModel`** — `Model<OrderDocument>` type alias for use in services/repositories.
- **`orderLineProductSchema`** — Mongoose sub-document schema for the embedded snapshot. Deliberately narrower than `productSchema`: no `onHand`/`reserved` counters, no image URLs. Has its own `{ timestamps: true }`.
- **`applyOrderTransform`** *(truncated, referenced throughout)* — the single serialization function that computes `totalItems`, `totalQuantity`, `totalPrice`, and `transferInstructions` from `items` before every response.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, the base transform this file builds on.
- **`src/modules/orders/domain/totals.ts`** — supplies `sumLineItems`, `orderTotal`, `LineItem` used inside the transform.
- **`src/modules/orders/domain/tax.ts`** — supplies `orderTaxBreakdown`, `TaxableLineItem` for VAT computation in the transform.
- **`src/modules/orders/domain/lifecycle.ts`** — supplies `isPayable` (likely gates the `transferInstructions` or refund-eligibility logic in the transform).
- **`src/modules/orders/config.ts`** — supplies `bankTransferBeneficiary`, `bankTransferIbanFriendly`, `transferInstructionsFor` for assembling the wire `transferInstructions` block.
- **`src/modules/orders/factories.ts`** — constructs `OrderDocument` instances; explicitly passes catalogue `createdAt`/`updatedAt` into the embedded snapshot because sub-document timestamps default independently.
- **`src/modules/orders/repository.ts`** — consumer of `OrderModel` for all DB queries.
- **`src/modules/orders/services/crud.ts`** — consumer of `OrderModel` for create/read/update/delete.
- **`src/modules/orders/services/cancel.ts`** — writes `pendingEffects` in the same conditional write that transitions status; the listener later empties the array.
- **`src/modules/cart/services/checkout.ts` / `reorder.ts`** — upstream callers that create orders (via factories) carrying the snapshot and currency freeze.
- **`src/modules/delivery/service.ts`** — reads `isPayable`-gated state and `transferReference` to coordinate delivery against payment.
- **`scenarios/flows/backdate.ts`** — scenario flow that exercises the schema (e.g., backdated `createdAt`).

## Notes

- **Embedded, never referenced.** `product` on an order line is a sub-document with no `ref`; `populate()` is structurally impossible. This is intentional: an order records *what was bought*, not what the catalogue says today.
- **`locale` lives on the item, not the product.** It records the language resolution that happened at order-creation time; reading it later must not re-resolve against the ambient locale.
- **Totals are never persisted.** They are derived in `applyOrderTransform` every time. Declaring them on `OrderDocument` would falsely claim a stored field.
- **`anonymizeAfter` + `userId` unset** happen atomically (same write). The order row is never deleted, only PII is scrubbed by `scripts/ops/reap-orders.ts` after the date elapses.
- **`orderNumber` is assigned once** (`allocateOrderNumber`) and never recomputed. Orders predating the field stay without one; retroactive minting is intentionally forbidden.
- **`currency` is frozen** from `shopCurrency()` at write time; a later config change cannot alter historical orders.
- **`transferReference` is not part of the wire `Order` contract.** It is exposed only inside `transferInstructions.reference` and omitted by the transform from the top-level shape.
- **`statusOverrides`** is strictly append-only and never emptied. Absent (not `[]`) means no override ever occurred.
- **`orderLineProductSchema` has its own `{ timestamps: true }`.** Factories must explicitly pass the catalogue row's dates into the snapshot rather than relying on defaults.
