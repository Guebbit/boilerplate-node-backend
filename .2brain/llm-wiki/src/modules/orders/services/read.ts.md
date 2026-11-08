---
source: src/modules/orders/services/read.ts
sha256: 60e80d555cf3454597f42d41c73d7fde578175bce6d665253124a3da7c420b65
generated_at: 2026-11-08T06:59:46.707873+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/read.ts

## Purpose

All read-side operations for the orders module: searching, single-order retrieval by ID, narrow batch lookups for sibling modules (delivery, checkout, admin boards, data export), and decryption of stored PII addresses. Writes live in `./crud` and `./remove`; this file is the read counterpart.

## Key elements

- **`withFulfillmentFilter`** – Rewrites `fulfillmentStatus` (derived, not a column) and `orderNumber` (canonicalised via `parseOrderNumber`) into repository conditions; ANDs them into the caller scope. An unparseable order number yields `$in: []` (empty page, not an error).
- **`search`** – Primary search handler. Delegates to `orderRepository.search`, resolves current product images via `resolveCurrentImages`, and optionally emits the `orders_viewed` analytics event. Returns `{ items: ExportOrder[], meta }`.
- **`ownOrderIds`** – All order IDs for a user, paged internally with `readAll`. Returns bare string IDs (wire shape `id`), no image resolution or analytics.
- **`OrderBrief`** (interface) – Minimal per-order data for admin boards: `id`, `orderNumber`, `userId?`, `email`, `paidAt?`.
- **`orderBriefsByIds`** – Batch-fetches briefs by ID (`$in` query) in one round-trip. Returns `Map<string, OrderBrief>`; unmatched IDs are simply absent.
- **`findOwnOrders`** – All orders for a user in `ExportOrder` shape, routed through `search` (so image resolution runs). No analytics emit — an export is not a view.
- **`getById`** – Single `OrderDocument` by ID with optional scope filter. Returns `undefined` for falsy ID or not-found.
- **`getForCaller`** – `getById` wrapped in `callerScope(authContext)`; a missing, malformed, or foreign order all resolve to `undefined` so the controller can 404 uniformly.
- **`billingAddressOf` / `shippingAddressOf`** – Decrypt the stored ciphertext address on an `OrderDocument` via `decryptOrderAddress`. `billingAddressOf` is for invoice issuance; `shippingAddressOf` is for delivery's copy onto a shipment.
- **`openUnpaidOrderIds`** – IDs of a user's currently open, unpaid orders (regardless of payment method). Used by checkout's open-order stock cap.
- **`findManyByIds`** – Returns `OrderReference[]` (order number + email) for a set of IDs. No lines, no addresses.

## Relationships

- **`src/infrastructure/persistence/search.ts`** – Provides `readAll`, `MAX_CONFIGURED_PAGE_SIZE`, and `PaginatedMeta` for internal pagination in `ownOrderIds` and `findOwnOrders`.
- **`src/infrastructure/persistence/create-repository.ts`** – Provides `toObjectId` used in `orderBriefsByIds` to convert string IDs for the `$in` query.
- **`src/infrastructure/observability/analytics/index.ts`** – Provides `emitAnalyticsEvent` / `buildAnalyticsBase`; called in `search` when a `CallerContext` is present.
- **`src/modules/orders/repository.ts`** – Supplies `orderRepository`, the sole data-access object used by every function in this file.
- **`src/modules/orders/model.ts`** – Source of the `OrderDocument` and `OrderReference` type shapes.
- **`src/modules/orders/pii.ts`** – Provides `decryptOrderAddress` used by `billingAddressOf` and `shippingAddressOf`.
- **`src/modules/orders/domain/index.ts`** – Re-exports `buyerIdOf` and `fulfillmentStatusFilter` (the latter defined in `domain/fulfillment.ts`) used in `orderBriefsByIds` and `withFulfillmentFilter` respectively.
- **`src/modules/orders/analytics.ts`** – Supplies the `ordersAnalyticsEvents.ORDERS_VIEWED` event name.
- **`src/modules/orders/services/current.ts`** – Provides `resolveCurrentImages`, batched per page in `search`.
- **`src/modules/orders/services/export.ts`** – Consumer of `findOwnOrders` for the account data-export flow.
- **`src/modules/delivery/presenter.ts`** – Consumer of `shippingAddressOf` to copy the plaintext address onto a shipment.
- **`src/modules/orders/services/index.ts`** – Re-exports the public surface of this file for other modules.

## Notes

- `getById` always returns a hydrated `OrderDocument` (ciphertext addresses), **not** the wire-shape `Order`. Only `toJSON` or the explicit `billingAddressOf` / `shippingAddressOf` helpers decrypt. Callers must not assume the address fields are already plaintext.
- `search` emits analytics only when a `CallerContext` is supplied. `findOwnOrders` deliberately omits context so an export does not register as a "view."
- `ownOrderIds` and `findOwnOrders` both page internally with `readAll`, but `ownOrderIds` hits the repository directly (no image resolution), while `findOwnOrders` goes through `search` (image resolution runs). Pick the one matching your need.
- `orderBriefsByIds` and `findManyByIds` both short-circuit on an empty input array, returning an empty `Map` or `[]` without hitting the database.
- `withFulfillmentFilter` is exported and can be composed by callers who need to add their own scope conditions before calling the repository directly.
