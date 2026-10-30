---
source: src/modules/orders/model.ts
sha256: 59939da77fe6b6135b864eb9a84a5c2939cf0d4c6cb4e4f5da4e963de5b20bd3
generated_at: 2026-10-29T04:43:02.675806+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/model.ts

## Purpose

Defines the Mongoose schema, document interface, and serialization transform for the order aggregate. It embeds a frozen product snapshot (locale-resolved, tax-rate-resolved) on each order line rather than referencing the live catalogue, and derives wire-only totals (`totalItems`, `totalQuantity`, `totalPrice`) at a single serialization point so they can be marked required in the contract without being stored.

## Key elements

- **`FrozenOrderLineProduct`** — `ProductSnapshot` minus `taxClass`, plus a resolved `taxRate: number` and optional `preorder` flag. Freezes the rate that was actually charged; never re-derives from a tax class.
- **`OrderDocumentItem`** — shape of one embedded order line: the frozen product, `quantity`, optional backorder fields (`backorderedQuantity`, `promisedAt`, `promiseDated`), and `locale` (the language into which `title`/`description` were resolved at creation).
- **`OrderReference`** — minimal cross-module identifier (`id`, `orderNumber`, `email`) for list composition without loading the full document.
- **`OrderDocument`** — the full Mongoose document. Omits the wire's three totals (derived, not stored), re-types `userId` as `ObjectId?`, and adds persisted fields absent from the contract: `piiClockStartedAt`, `moneyReceivedAt`, `conformityUntil`, `conformityExtendedAt`, `paymentStatus`, `returnStatus`, `fulfillment`.
- **`OrderModel`** — `Model<OrderDocument>` type alias for repository/service use.
- **`orderAddressSchema`** — shared `_id: false` schema for `shippingAddress` and `billingAddress`.
- **`orderLineProductSchema`** — the embedded subdocument schema for the product snapshot (narrower than the catalogue's `productSchema`; no `ref`).
- **`applyOrderTransform`** (referenced in header comment) — the serialization hook that computes `totalItems`, `totalQuantity`, `totalPrice` from `items` on every response.

## Relationships

- **`@infrastructure/persistence/revision-plugin`** — `revisionPlugin` is applied to the order schema, giving it revision tracking.
- **`@infrastructure/persistence/serialize`** — `applySerialization` is the mechanism through which `applyOrderTransform` is registered so totals are derived on read.
- **`@infrastructure/persistence/money-field`** — `moneyPath` / `moneyPlugin` handle monetary field encoding within the schema.
- **`src/modules/cart/services/checkout.ts`** — the order-creation path (`placeOrder`) that mints `orderNumber`, freezes `currency`, and writes the initial document.
- **`src/modules/delivery/services/*`** (`act`, `actions`, `announce`, `deliver`, `ensure`, `found`, `fulfill`, `holds`, `lost`, `notice`) — read and write the `fulfillment?: FulfillmentSummary` field on the order document; `recordFulfillmentProgress` is the sole write path, executed inside the delivery act's transaction.
- **`scenarios/flows/backdate.ts`** — exercises order backdating against this schema's frozen fields.

## Notes

- `product` on each item is an **embedded subdocument with no `ref`** — `populate()` is structurally impossible. This is intentional: purchase history must not shift when the catalogue or warehouse data changes.
- `locale` lives on the **item**, not on the product snapshot, because it describes the resolution event for the whole line.
- `paidAt` doubles as a cross-module proxy for "an invoice exists," avoiding an `orders → invoicing` import. The one documented gap is a failed `ORDER_STATUS_CHANGED` listener.
- `totalItems`, `totalQuantity`, `totalPrice` are **never persisted**; declaring them on `OrderDocument` would falsely imply a stored field. They exist only via `applyOrderTransform` on the wire.
- `orderNumber` is assigned once at creation (`allocateOrderNumber`) and never recomputed — a number minted later cannot claim the order's true position in the sequence.
