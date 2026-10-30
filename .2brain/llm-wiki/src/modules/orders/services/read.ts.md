---
source: src/modules/orders/services/read.ts
sha256: 60e80d555cf3454597f42d41c73d7fde578175bce6d665253124a3da7c420b65
generated_at: 2026-10-29T04:49:06.108384+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/read.ts

## Purpose

Read-side service layer for the orders module. Provides the search endpoint handler, single-order retrieval, narrow batch reads (ids, briefs, references), and PII address decryption that sibling modules (delivery, payments, checkout) depend on. All writes live in `./crud` and `./remove`; this file is strictly read.

## Key elements

- **`withFulfillmentFilter`** — Rewrites `fulfillmentStatus` (derived, not a column) and `orderNumber` (canonicalised via `parseOrderNumber`) into `$and` conditions the repository understands. An unparseable order number yields an empty page, not an error.
- **`search`** — Main listing read. Applies the filter rewrite, resolves current images in one batched `$in` (via `resolveCurrentImages`), and emits `orders_viewed` analytics only when a `CallerContext` is supplied.
- **`ownOrderIds`** — Paged internal read returning only `order.id` strings for a user. Skips image resolution and analytics.
- **`OrderBrief`** / **`orderBriefsByIds`** — Minimal per-order identity (id, orderNumber, email, optional userId/paidAt) for admin boards. Single `findAll` query capped to the requested id count.
- **`findOwnOrders`** — Full `ExportOrder[]` for data export. Routes through `search` (so image resolution runs) but passes no context, so no analytics emit.
- **`getById`** / **`getForCaller`** — Single-order by id. `getById` accepts an optional scope filter; `getForCaller` wraps it with `callerScope(authContext)`. Both return a hydrated `OrderDocument` (addresses still in ciphertext).
- **`billingAddressOf`** / **`shippingAddressOf`** — Decrypt a single address field from an `OrderDocument` via `decryptOrderAddress`. Intended for invoice issuance (billing) and delivery shipment copying (shipping).
- **`openUnpaidOrderIds`** — Ids of a user's currently open, unpaid orders (any payment method). Used by checkout's open-order cap.
- **`findManyByIds`** — Narrow reference lookup (order number + email) for display beside unrelated lists (e.g. payments).

## Relationships

- **`@infrastructure/persistence/search`** — Provides `readAll` for multi-page iteration and `MAX_CONFIGURED_PAGE_SIZE` as the internal page size.
- **`@infrastructure/persistence/create-repository`** — Supplies `toObjectId` for converting string ids to Mongo ObjectId in `orderBriefsByIds`.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` used in `search` to fire `orders_viewed`.
- **`../analytics`** — Source of the `ordersAnalyticsEvents.ORDERS_VIEWED` constant.
- **`../pii`** — `decryptOrderAddress` called by both address helpers.
- **`../repository`** — `orderRepository` is the sole data-access point for every read in this file.
- **`./current`** — `resolveCurrentImages` batch-resolves up-to-date product images for a page of orders.
- **`./scope`** — `callerScope` / `ownerScope` build the filter objects passed to the repository.
- **`../domain` (index)** — `buyerIdOf` extracts the buyer id; `fulfillmentStatusFilter` translates the domain enum into a query condition.
- **`./order-numbering`** — `parseOrderNumber` canonicalises user-supplied order numbers.
- **`../model`** — Type-level: `OrderDocument` (stored shape) and `OrderReference` (narrow display shape).
- **`src/modules/delivery/presenter.ts`** — Consumer of `shippingAddressOf` to copy the plaintext address onto a shipment.
- **`src/modules/orders/services/export.ts`** — Consumer of `findOwnOrders` for the account data-export flow.
- **`src/modules/orders/services/index.ts`** — Barrel re-export for the service layer.

## Notes

- `OrderDocument` addresses are **ciphertext**; always go through `billingAddressOf` / `shippingAddressOf` to get plaintext. Calling `.toJSON()` also decrypts but is the DTO path, not the service path.
- `ownOrderIds` and `findOwnOrders` both return every order for a user but differ in cost: the former is a thin id-only read, the latter runs full image resolution. Pick based on what the caller needs.
- `search` omits the analytics emit entirely when `context` is `undefined`—there is no "emit without a caller" path.
- `orderBriefsByIds` and `findManyByIds` both short-circuit to an empty result for a zero-length input array, avoiding a needless repository call.
- The module docstring notes that writes live in `./crud` and `./remove`; do not add mutation logic here.
