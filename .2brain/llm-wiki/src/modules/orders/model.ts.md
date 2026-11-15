---
source: src/modules/orders/model.ts
sha256: 9ad8347baeb6194d26becd94b8803cf81ce084bd85bcabae6455d31ab5c198ab
generated_at: 2026-11-14T20:38:51.493724+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/model.ts

## Purpose

Defines the Mongoose schema, TypeScript interfaces, and serialization transform for the Order document. It is the single persistence-layer contract that pins what an order stores (embedded product snapshot, quantities, frozen timestamps, stamped statuses) and what is derived at read time (totals, wire-level status fields), so that no later catalogue edit, locale change, or config drift can rewrite purchase history.

## Key elements

- **`FrozenOrderLineProduct`** — `Omit<ProductSnapshot, 'taxClass'> & { taxRate: number; preorder?: boolean }`. The shape embedded in each order line: resolved numeric rate instead of tax class, plus a one-time `preorder` flag frozen at checkout.
- **`OrderDocumentItem`** — A single line: embedded `product` (no `ref`, no `ObjectId`), `quantity`, optional `backorderedQuantity` / `promisedAt` / `promiseDated`, and `locale` (the language the title/description were resolved into, stored on the item, not the product).
- **`OrderReference`** — Minimal identity (`id`, `orderNumber`, `email`) for cross-module list composition.
- **`OrderDocument`** — The full Mongoose document interface. Omits wire-only fields (`totalItems`, `totalQuantity`, `totalPrice`) and redeclares dates as `Date` (wire contract types them as ISO strings). Carries stamped fields (`paymentStatus`, `returnStatus`, `fulfillment`) and frozen legal timestamps (`paidAt`, `withdrawUntil`, `conformityUntil`, `conformityExtendedAt`, `moneyReceivedAt`).
- **`OrderModel`** — `Model<OrderDocument>` type for repository/service use.
- **Schema & transform** (in the truncated tail) — Wires `revisionPlugin`, `moneyPlugin`, `postalAddressPaths`, `canonicalLocaleSetter`, and `applySerialization`; `applyOrderTransform` derives the three totals from `items` at the single serialization choke-point.

## Relationships

- **`@infrastructure/persistence/postal-address-paths`** — imports `postalAddressPaths` to declare the address sub-path schema for `shippingAddress` / `billingAddress`.
- **`@infrastructure/persistence/revision-plugin`** — imports `revisionPlugin` and applies it to the order schema for audit history.
- **`@infrastructure/persistence/money-field`** — imports `moneyPath` and `moneyPlugin` for monetary subdocument fields.
- **`@infrastructure/persistence/serialize`** — imports `applySerialization`; the order's transform funnels through this single point so every response carries the derived totals.
- **`@infrastructure/i18n`** — imports `canonicalLocaleSetter` to normalise the per-item `locale` field on write.
- **`src/modules/delivery/services/fulfill.ts`** — the delivery module's `fulfill` path writes the `fulfillment` summary field (via `recordFulfillmentProgress`) inside the act's transaction; this file only declares the `FulfillmentSummary` shape on `OrderDocument`.
- **`src/modules/cart/services/checkout.ts`** (`placeOrder`) — the sole writer of `orderNumber`, `currency`, `termsVersion`, and `paidAt`-adjacent fields at creation time.

## Notes

- **Product is embedded, never referenced.** There is no `ref` and no `ObjectId` on `product`; `populate()` is structurally impossible. The embedded schema is intentionally narrower than the catalogue's (`taxClass` stripped, `taxRate` added).
- **`locale` lives on the item, not the product.** It records the resolution context of the whole line; re-reading the order must not re-resolve text against the ambient locale.
- **Totals are never persisted.** `totalItems`, `totalQuantity`, `totalPrice` are computed by `applyOrderTransform` at serialization. Declaring them on `OrderDocument` would falsely imply a stored column.
- **`paidAt` doubles as an "invoice exists" proxy** so that `orders` never needs to import `invoicing` (which depends on `orders`). A failed `ORDER_STATUS_CHANGED` listener is the one documented gap where the two can disagree.
- **`userId` is optional by design** — the account may be erased while the order/invoice survives (GDPR Art. 17(3)(b)/(e)).
- **`orderNumber` is assigned once** at creation and never recomputed; it is a receipt number, not a tax-invoice number.
- **`conformityExtendedAt`** is present at most once (the 12-month extension under Directive 2024/1799 is a single event).
