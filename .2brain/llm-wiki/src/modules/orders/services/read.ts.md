---
source: src/modules/orders/services/read.ts
sha256: c8983e9bad660ec5276c14af35052fcdf3f09d473741c811f0d3409f6d2d2fef
generated_at: 2026-11-14T20:45:51.128952+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/read.ts

## Purpose

Provides all read-side operations for orders: paginated search, single-order retrieval by ID, narrow batch lookups (IDs, briefs, references), PII address decryption, and the open-unpaid-order check that checkout's stock cap depends on. It is the read counterpart to the write services in `./crud` and `./remove`, and the entry point controllers use when they need order data without side effects.

## Key elements

- **`withFulfillmentFilter`** – Translates the two non-column filters (`fulfillmentStatus`, `orderNumber`) into repository conditions and ANDs them with the caller scope. Canonicalises `orderNumber` via `parseOrderNumber`; a non-numeric value yields an empty page (`$in: []`) rather than an error.
- **`search`** – Paginated order search. Resolves current images in one batched call, then optionally emits the `orders_viewed` analytics event. Returns `{ items: ExportOrder[], meta: PaginatedMeta }`.
- **`ownOrderIds(userId)`** – Every order ID for a user, paged internally with `readAll`. Returns the wire-shape `id` field, not full documents.
- **`OrderBrief`** – Minimal shape (id, orderNumber, email, optional userId, optional paidAt) for admin boards.
- **`orderBriefsByIds`** – Batch lookup returning a `Map<string, OrderBrief>`; unmatched IDs are simply absent.
- **`findOwnOrders(userId)`** – All orders for a user in `ExportOrder` wire shape. Routes through `search` (so image resolution runs) but passes no `context`, suppressing the analytics emit.
- **`getById(id, scope?)`** – Single order by ID as a hydrated `OrderDocument`. Returns `undefined` for falsy id or no match.
- **`getForCaller(id, authContext?)`** – `getById` wrapped in `callerScope`; missing, malformed, or another user's order all resolve to `undefined` (controllers map to 404).
- **`billingAddressOf` / `shippingAddressOf`** – Decrypt the stored ciphertext on an `OrderDocument` into a plaintext address object; return `undefined` if the field is absent.
- **`openUnpaidOrderIds(userId)`** – IDs of a user's currently open-and-unpaid orders; the input to checkout's open-order cap.
- **`findManyByIds(ids)`** – Batch lookup of `OrderReference` (order number + email) for display beside other lists (e.g. payments).

## Relationships

| Neighbor | Interaction |
|---|---|
| `../repository` (`orderRepository`) | All data access: `search`, `findByIdScoped`, `findByIds`, `findOpenUnpaidIdsOf`, `findManyReferences`. |
| `./current` (`resolveCurrentImages`) | `search` calls it once per page to swap in the latest product images. |
| `./scope` (`callerScope`, `ownerScope`) | Builds the scope object passed to the repository for `getForCaller`, `ownOrderIds`, `findOwnOrders`. |
| `../domain` (`buyerIdOf`, `fulfillmentStatusFilter`) | Derives the buyer ID for `OrderBrief` and builds the fulfillment-status filter condition. |
| `../pii` (`decryptOrderAddress`) | `billingAddressOf` and `shippingAddressOf` decrypt stored ciphertext. |
| `@infrastructure/persistence/search` (`readAll`, `MAX_CONFIGURED_PAGE_SIZE`) | Internal pagination loop in `ownOrderIds` and `findOwnOrders`. |
| `@infrastructure/observability/analytics` | `search` emits `ORDERS_VIEWED` via `emitAnalyticsEvent` + `buildAnalyticsBase`. |
| `../analytics` (`ordersAnalyticsEvents`) | Supplies the event constant for the analytics emit. |
| `../model` (`OrderDocument`, `OrderReference`) | Type imports for the hydrated document and the narrow reference shape. |
| `./order-numbering` (`parseOrderNumber`) | Canonicalises the `orderNumber` filter in `withFulfillmentFilter`. |
| `src/modules/delivery/presenter.ts` | Consumer: copies `shippingAddressOf` output onto a shipment (noted in docstring). |

## Notes

- **`fulfillmentStatus` is derived, not stored.** The filter is built from the same table that serialises the value at read time, so it cannot disagree with the displayed status.
- **`orderNumber` canonicalisation is silent.** A non-numeric input (e.g. a quoted word) produces an empty page, not a 400/500—mirroring how payments handle a bad `transferReference`.
- **`getById` always returns a hydrated `OrderDocument`** (ciphertext addresses included). Use `billingAddressOf`/`shippingAddressOf` to get plaintext; calling `toJSON` is an alternative but these helpers are the sanctioned path.
- **`findOwnOrders` intentionally omits the analytics context** so a data-export does not register as a "view" in dashboards.
- **`ownOrderIds` reads the wire shape (`Order.id`)**, not the `OrderDocument._id`. Don't confuse the two when mapping results.
- **`openUnpaidOrderIds` is order-method-agnostic** (card, bank transfer, `processing` card all hold stock); the cap exists to prevent one account exhausting inventory.
