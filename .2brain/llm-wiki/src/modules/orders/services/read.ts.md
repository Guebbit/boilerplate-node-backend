---
source: src/modules/orders/services/read.ts
sha256: 3a267c573838cff24cb17b6fe678ec4b05cd66b737f331d566c836fd3c5c8e95
generated_at: 2026-10-15T11:09:45.163884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/read.ts

## Purpose

Read-only query layer for the orders module. Provides search, single-order retrieval, and a set of narrow reads (id lists, briefs, references, refund lookups) that sibling modules and controllers consume without touching the repository directly. Writes intentionally live elsewhere (`./crud`, `./remove`).

## Key elements

- **`withFulfillmentFilter`** — Translates a `fulfillmentStatus` search param (a derived value, not a stored column) into an `$and` condition via `fulfillmentStatusFilter` and merges it into the caller's scope. Returns a `[request, scope]` tuple ready for `orderRepository.search`.
- **`search`** — Paginated order search (matches `POST /orders/search`). Batch-resolves current images for the whole page, emits the `ORDERS_VIEWED` analytics event when a `CallerContext` is supplied, and returns `{ items, meta }`.
- **`ownOrderIds`** — Paged-through-`readAll` query returning every order id for a user. No image resolution, no analytics; used by sibling modules that only need ids.
- **`OrderBrief`** (interface) — Minimal shape (`id`, `orderNumber`, `userId?`, `email`, `paidAt?`) for admin boards that need buyer identity and payment timing without full order documents.
- **`orderBriefsByIds`** — Single `findAll` with `$in` lookup returning a `Map<string, OrderBrief>`; designed for a page-sized batch from the delivery board.
- **`findOwnOrders`** — All orders for a user in wire shape, going through `search` (so image resolution applies) but without an analytics context. Intended for data-export.
- **`getById`** / **`getForCaller`** — Single-order fetch; `getForCaller` wraps `getById` with `callerScope` so a foreign/missing id yields `undefined` (controller maps all three to 404).
- **`billingAddressOf`** — Decrypts the stored ciphertext billing address on an `OrderDocument` for the invoice issuer.
- **`openUnpaidOrderIds`** — Ids of orders currently holding stock (open + unpaid), used by checkout's open-order cap.
- **`findManyByIds`** — Lightweight `{ id, orderNumber, email }` references for display alongside other entities (e.g., a payment list).
- **`findOwedRefunds`** — Orders cancelled after payment whose refund is still pending, filtered by a caller-supplied cutoff and limit.
- **`getByTransferReference`** — Exact-match lookup of an order by its normalized bank-transfer RF reference.

## Relationships

- **`@infrastructure/persistence/search`** — Uses `readAll` and `MAX_CONFIGURED_PAGE_SIZE` to transparently paginate multi-page reads (`ownOrderIds`, `findOwnOrders`).
- **`@infrastructure/persistence/create-repository`** — Uses `toObjectId` to cast string ids to BSON ObjectIds in `orderBriefsByIds`.
- **`@infrastructure/observability/analytics`** — Emits `ORDERS_VIEWED` in `search` via `emitAnalyticsEvent` + `buildAnalyticsBase`.
- **`../analytics`** — Source of the `ordersAnalyticsEvents.ORDERS_VIEWED` constant.
- **`../pii`** — `decryptOrderAddress` called by `billingAddressOf` to produce plaintext for invoicing.
- **`../domain` (fulfillment)** — `fulfillmentStatusFilter` builds the Mongo conditions for the derived status filter.
- **`../model`** — Type-only imports: `OrderDocument`, `OrderReference`.
- **Delivery board** (consumer) — `orderBriefsByIds` is the narrow read the board uses to label orders on its page.
- **Invoicing / personal-data** (consumers) — `billingAddressOf` feeds the invoice issuer; `findOwnOrders` feeds the account data export.

## Notes

- `search` only emits analytics when a `CallerContext` is passed; `findOwnOrders` deliberately omits it so an export is not counted as a "view".
- `withFulfillmentFilter` strips `fulfillmentStatus` from the request object before returning it — the filter is applied via scope, not as a stored-field match. This keeps the derived status consistent with what `fulfillmentStatusOf` would serialize.
- `orderBriefsByIds` uses `limit: orderIds.length` as a safety cap; if fewer orders match, the missing ids are simply absent from the returned Map.
- `findOwedRefunds` filters on `pendingEffects.includes('refund')` client-side after a broader `findWithPendingEffects` query; the `cutoff` date is the caller's responsibility (e.g., the retry sweep's grace window).
- `getByTransferReference` expects an already-normalized reference; normalization is the caller's job (`domain/transfer-reference.ts`).
