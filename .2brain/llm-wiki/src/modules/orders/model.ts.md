---
source: src/modules/orders/model.ts
source_sha256: 7f5d1d0b03c950c4061f736aeb38250870eb38f22e76cc7a4a2ae329fbd26fa6
context_sha256: 41078751edc1766407562644f058503c7d715e24fd2439027e1ec55756d18555
generated_at: 2026-11-22T06:15:38.146175+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/model.ts

## Purpose
Defines the order Mongoose schema and its TypeScript document types, plus the serialization transform that derives wire-only totals. An order embeds a frozen product snapshot (not a reference to the live catalogue) so later product edits, warehouse changes, or locale changes cannot rewrite purchase history.

## Key elements
- `FrozenOrderLineProduct`: `ProductSnapshot` minus `taxClass`, plus a resolved numeric `taxRate` and an optional `preorder` flag. The frozen rate is stored, never the class it came from. `rateType` is kept as-is.
- `OrderDocumentItem`: one embedded line with `product` (snapshot, no `ref`), `quantity`, optional backorder fields (`backorderedQuantity`, `promisedAt`, `promiseDated`), and `locale`. `locale` is the language that `product.title`/`description` were resolved into at order creation and then frozen.
- `OrderReference`: `{ id, orderNumber, email }`, the shape other modules use when listing orders.
- `OrderDocument`: the document interface. It extends the generated `Order` with several fields omitted or overridden. Overridden: `userId`, `status`, `items`, and the `Date`-typed `createdAt`/`updatedAt`/`deletedAt`/`payBy`/`paidAt`/`withdrawUntil`. Omitted: `totalItems`, `totalQuantity`, `totalPrice`. It declares these persisted fields:
  - Identity and frozen order data: `orderNumber`, `currency`, `termsVersion`, `notes`, optional `userId`.
  - Retention and legal clocks: `piiClockStartedAt`, `withdrawUntil`, `conformityUntil`, `conformityExtendedAt`.
  - Payment and money state: `paidAt`, `moneyReceivedAt`, and stamped `paymentStatus`.
  - Return and fulfillment state: stamped `returnStatus` and `fulfillment`.
- `OrderModel`: `Model<OrderDocument>`. Business logic lives in `./services` and queries in `./repository`.
- The schema, `applyOrderTransform` and the model export are referenced in the header and imports but fall beyond the visible portion of the file.

## Relationships
- **Persistence helpers** (`src/infrastructure/persistence/`): imports `postalAddressPaths`, `revisionPlugin`, `applySerialization` (`serialize.ts`), and `moneyPath`/`moneyPlugin` (`money-field.ts`).
- **i18n** (`src/infrastructure/i18n`): imports `canonicalLocaleSetter`, which backs the item `locale` field. `locale-tag.ts` is a related neighbor.
- **Domain modules** (`./domain/*`): imports totals (`sumLineItems`, `orderTotal`), tax (`orderTaxBreakdown`), fulfillment (`fulfillmentStatusOf`, `FulfillmentSummary`), and projections (`paymentStatusOf`, `returnStatusOf`, `STAMPED_*` statuses and types). These support the derived fields.
- **Other modules**: imports `ProductSnapshot` from `@modules/products` and `shopDayOf` from `@modules/shop`. It also imports `decryptSerializedOrder` from `./pii`.
- **Consumers** (graph neighbors): `src/modules/cart/services/checkout.ts` and the `src/modules/delivery/services/*` files (`act`, `actions`, `announce`, `deliver`, `ensure`, `found`, `fulfill`) are related through the dependency graph, as is `scenarios/flows/backdate.ts`. The visible portion does not show how they use this file.
- Per the doc comments, stamped fields are written through status-marking functions (`markPaid`, `markPaymentStatus`, `markReturnStatus`) and `recordFulfillmentProgress`, which live in the orders `./services` directory rather than in this file. Snapshot text resolution is in `./services/snapshot`.

## Notes
- `totalItems`, `totalQuantity` and `totalPrice` are never stored. `applyOrderTransform` derives them from `items` at the single serialization point, so the contract can mark them required.
- `orderNumber` (`{year}-{sequence}`), `currency`, `termsVersion`, `withdrawUntil` and `conformityUntil` are frozen at write time and never recomputed.
- `userId` is intentionally absent on walk-in orders and on orders whose account was erased. This is by design, not a dangling foreign key.
- `paidAt` is the proxy `orders` uses to infer that an invoice exists, which avoids a dependency on `invoicing`.
- `moneyReceivedAt`, `conformityUntil`, `conformityExtendedAt` and `fulfillment` are internal and not sent on the wire. The wire's `paymentStatus`, `returnStatus`, `fulfillmentStatus` and `actions` are derived from the stored fields.
- Order items use `orderLineProductSchema`, not `productSchema`.
