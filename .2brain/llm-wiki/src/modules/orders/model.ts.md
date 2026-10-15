---
source: src/modules/orders/model.ts
sha256: 6bc325ed89c8d3579f2a9e7c16554d819320c0faa26b0c217dd5c7b1006083ec
generated_at: 2026-10-15T11:04:40.584960+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/model.ts

## Purpose

Defines the Mongoose document interface and schema for the `Order` aggregate. It embeds a frozen product snapshot (not a catalogue reference), declares which fields are persisted versus derived at serialization time, and establishes the shared types (`FrozenOrderLineProduct`, `OrderDocumentItem`, `OrderDocument`) that every order read/write path depends on.

## Key elements

- **`FrozenOrderLineProduct`** — `ProductSnapshot` minus `taxClass`, plus the resolved numeric `taxRate` and an optional `preorder` flag. The schema stores the rate that was actually charged, never the tax class it came from.
- **`OrderDocumentItem`** — A single embedded line: `{ product: FrozenOrderLineProduct, quantity, locale }`. `locale` records the language into which `title`/`description` were resolved at order-creation time; it lives on the item, not the product.
- **`OrderReference`** — Minimal cross-module handle: `{ id, orderNumber, email }`.
- **`ORDER_PENDING_EFFECTS` / `OrderPendingEffect`** — Currently `['refund']`; tracks cancel consequences the cancel itself could not guarantee (money side, since the event bus has no retry).
- **`OrderDocument`** — The full Mongoose `Document` interface. Omits wire-only fields (`totalItems`, `totalQuantity`, `totalPrice`, `transferInstructions`) and re-typed fields (`userId?`, `status`, `items`, dates, `orderNumber`, `currency`, `anonymizeAfter`, `paidAt`, `withdrawUntil`, `paymentStatus`, `returnStatus`, `fulfillment`, `pendingEffects`).
- **Imports from infrastructure** — `revisionPlugin` (revision tracking), `applySerialization` (single serialization point), `moneyPath`/`moneyPlugin` (decimal money handling).
- **Imports from domain** — `sumLineItems`, `orderTotal`, `orderTaxBreakdown`, `isPayable`, `decryptSerializedOrder`, `fulfillmentStatusOf`, `paymentStatusOf`, `returnStatusOf`, and the stamped-status enums.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — Provides `moneyPath` and `moneyPlugin`, applied to monetary schema fields so they round-trip as decimals.
- **`src/infrastructure/persistence/revision-plugin.ts`** — Applied to the schema for audit/version tracking of order mutations.
- **`src/infrastructure/persistence/serialize.ts`** — `applySerialization` is the single point where `OrderDocument` is transformed to the wire `Order` shape (deriving totals, `transferInstructions`, `paymentStatus`, `fulfillmentStatus`, `returnStatus`).
- **`src/modules/cart/services/checkout.ts`** — Creates `OrderDocument` rows via the schema defined here at order-creation time.
- **`src/modules/cart/services/reorder.ts`** — Reads an existing order's embedded snapshots to seed a new one.
- **`src/modules/delivery/services/fulfill.ts`, `progress.ts`, `ship.ts`, `delivers.ts`** — Write `fulfillment` / `paidAt` / status transitions back onto the order document.
- **`src/modules/delivery/services/holds.ts`** — Interacts with the `payBy` hold window and stock-release semantics the schema documents.
- **`src/modules/delivery/services/actions.ts`, `notice.ts`, `notify.ts`, `ensure.ts`** — Read `fulfillment`, `paidAt`, and derived statuses from the order document to build buyer-facing data.
- **`scenarios/flows/backdate.ts`** — Exercises the schema's `paidAt`/`withdrawUntil` semantics in integration scenarios.

## Notes

- **No `ref`, no `populate`.** The product is an embedded subdocument (`orderLineProductSchema`), intentionally narrower than the catalogue's `productSchema`. There is no ObjectId to join; an order keeps what was bought, not what the catalogue says today.
- **Totals are never stored.** `totalItems`, `totalQuantity`, `totalPrice` exist only as derived output of `applyOrderTransform`. The schema has no fields for them.
- **`paidAt` is a cross-module proxy.** Other modules (scope, remove) read `paidAt` to check "has this order been invoiced?" rather than importing the `invoicing` module, avoiding a circular dependency. A listener failure is the one documented gap.
- **`orderNumber` and `currency` are write-once.** Neither is ever recomputed; config changes after creation must not rewrite historical orders.
- **`anonymizeAfter` ≠ deletion.** The order row is never deleted; a reaper script scrubs PII (email, addresses, notes) once this timestamp elapses. `userId` is unset at erasure time, making it the one intentionally dangling FK.
- **`locale` is per-item, not per-product.** It describes the resolution context of the whole line at purchase time, not a property of the product itself.
