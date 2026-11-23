---
source: src/modules/orders/services/read.ts
source_sha256: a648b6c8a2e5403ecc6179feb5757741c101a57656a8a0f48d85a8c550a0ec4b
context_sha256: 077db2ed41aa701acd5c4fbcacf50db18d4569fd62a804b04a38a266750b504d
generated_at: 2026-11-22T06:22:33.774827+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/read.ts

## Purpose
Read-side service for orders: searching, fetching by id, and the narrow lookups that sibling modules (payments, checkout, delivery, invoicing, admin boards, account export) need. Writes live elsewhere (`./crud`, `./remove`, per the module header).

## Key elements
- `withFulfillmentFilter(request, scope)` — rewrites the two non-column filters into repository conditions and ANDs them with the caller's scope. `fulfillmentStatus` becomes `fulfillmentStatusFilter(...)`. `orderNumber` is canonicalised via `parseOrderNumber`; a value that isn't a valid number yields an `{ _id: { $in: [] } }` condition, which returns an empty page rather than an error. Returns the argument tuple for `orderRepository.search`.
- `search(search?, scope?, context?)` — runs the repository search, resolves current images for the whole page with one batched lookup (`resolveCurrentImages`), and emits `ORDERS_VIEWED` analytics only if `context` is passed. Returns `{ items: ExportOrder[], meta }`.
- `ownOrderIds(userId)` — every order id for an account. It pages through `orderRepository.search` with `readAll` and skips image resolution and analytics.
- `OrderBrief` / `orderBriefsByIds(ids)` — minimal buyer and paid-at view (id, orderNumber, email, optional userId and paidAt) for admin boards. One `findByIds` query returns a `Map` keyed by id; unmatched ids are absent, and an empty input short-circuits.
- `findOwnOrders(userId)` — all of an account's orders in wire shape for data export. It pages through `search` (so image resolution runs) with no `context`, so no analytics emit.
- `getById(id, scope?)` — returns the hydrated `OrderDocument` via `findByIdScoped`, or `undefined` for a falsy id or no match.
- `getForCaller(id, authContext)` — `getById` behind `callerScope(authContext)`. Missing, malformed and not-yours all return `undefined`, so the controller can answer all three with the same 404.
- `billingAddressOf(order)` / `shippingAddressOf(order)` — decrypt the stored address ciphertext with `decryptOrderAddress`, or return `undefined` if the order has none.
- `openUnpaidOrderIds(userId)` — ids of the account's open, unpaid orders (`findOpenUnpaidIdsOf`), which checkout's open-order cap counts.
- `findManyByIds(ids)` — `OrderReference[]` (number and email) for the given ids, with an empty-input short-circuit.

## Relationships
- **`../repository`** — the sole data source: `search`, `findByIds`, `findByIdScoped`, `findOpenUnpaidIdsOf`, `findManyReferences`.
- **`@infrastructure/persistence/search`** — provides `readAll`, `MAX_CONFIGURED_PAGE_SIZE` and the `PaginatedMeta` type for internal paging.
- **`@infrastructure/observability/analytics`** and **`../analytics`** — `emitAnalyticsEvent`, `buildAnalyticsBase` and the `ORDERS_VIEWED` event.
- **`./current`** — `resolveCurrentImages` for search results.
- **`./scope`** (not in the neighbor list) — `callerScope` and `ownerScope` supply the access scopes.
- **`./order-numbering`** (not in the neighbor list) — `parseOrderNumber`.
- **`../domain`** — `buyerIdOf` and `fulfillmentStatusFilter`. The filter is built from the same table that serializes the derived value, so the two can't disagree.
- **`../pii`** — `decryptOrderAddress`.
- **`../model`** — `OrderDocument` and `OrderReference` types.
- Consumers named in the doc comments: payments (`findManyByIds`), checkout (`openUnpaidOrderIds`), the invoice issuer (`billingAddressOf`), and `delivery` (`shippingAddressOf`). The `delivery` consumer is a presenter or shipment copy, which matches the `src/modules/delivery/presenter.ts` neighbor. The file does not import any of these directly.

## Notes
- Hydrated `OrderDocument`s hold encrypted addresses. Only `toJSON` decrypts, so use `billingAddressOf` / `shippingAddressOf` when plaintext is needed.
- `ownOrderIds` calls the repository directly, while `findOwnOrders` goes through `search`. The two differ in image resolution but both skip analytics.
- `productId` filtering in search targets `items.product._id`, because product data is embedded rather than referenced.
