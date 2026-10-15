---
source: src/modules/orders/services/place.ts
sha256: 2e9d188d68ca44b0fdc60ecfe12afac31740fc47c7eda20a1ac6522f9e8e31a1
generated_at: 2026-10-15T11:09:24.985654+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/place.ts

## Purpose

The single write path for creating a new order row. Both the admin `create` in `crud.ts` and the cart `checkout` funnel through `placeOrder`, so the actual write, stock hold, and event announcement exist in exactly one place. It validates lines, freezes them, reserves stock, allocates the order number, and persists the document — returning a plain verdict rather than an HTTP envelope.

## Key elements

- **`placeOrder(input: PlaceOrderInput): Promise<PlaceOrderOutcome>`** — The sole exported function. Runs the pipeline: `checkOrderLines` → `freezeOrderLines` → `inventoryService.reserveForOrder` → `allocateOrderNumber` → `orderRepository.create` + `appendTimeline` + `announceInTransaction`. On a failed write after a successful hold, releases the hold in `catch`.
- **`PlaceOrderInput`** — All data needed for the write. Notable fields: `commitWith` (a callback that runs inside the same transaction and aborts it if it resolves `false`, used by checkout to atomically clear the cart), `shipping.method.priceFor` (prices against the *frozen* lines, not pre-frozen ones), `holdMinutes` (stock-hold length override).
- **`PlaceOrderOutcome`** — Discriminated union: `{ ok: true; order }` or one of `'no-lines' | 'product-missing' | 'insufficient-stock' | 'superseded'`. Callers map these to their own wire error codes.
- **`PlaceOrderLine`** — Pairs the caller's `{productId, quantity}` with a resolved `ProductSnapshot | null | undefined`.
- **`PlaceOrderShipping`** / **`PlaceOrderAddress`** — Shipping method (with a `priceFor` callback) and address shapes; both optional.
- **`OrderSuperseded`** (internal) — Error thrown inside the transaction to abort when `commitWith` reports a lost race.

## Relationships

- **`@modules/inventory`** (`inventoryService`, `StockShortfall`) — Calls `reserveForOrder` before the write and `releaseForOrder` in the catch path.
- **`@kernel/outbox`** (`announceInTransaction`) — Commits the order row, its timeline entry, and the `order.created` outbox event in one transaction; delivery is decoupled from the response.
- **`../domain/rules`** (`checkOrderLines`) — Pre-flight line validation; this file returns its verdict verbatim.
- **`../domain/transfer-reference`** (`buildReference`) — Mints the bank-transfer reference from the pre-generated `orderId` (not a second id).
- **`../repository`** (`orderRepository`) — Performs the actual `create` inside the outbox transaction.
- **`./announce`** (`createdEvent`) — Supplies the outbox event payload.
- **`../config`** (`shopCurrency`) — Provides the currency code stamped on the order.
- **`@infrastructure/persistence/create-repository`** (`toObjectId`) — Coerces `userId` to an `ObjectId` for the document write.
- **`@modules/cart/services/checkout`** — A caller; passes `commitWith` to atomically clear the cart in the same transaction.
- **`./services/crud.ts`** — A caller; its admin `create` maps the same verdict to `ORDER_INSUFFICIENT_STOCK`.
- **`./services/index.ts`** — Re-exports this module.

## Notes

- **Hold-before-write is deliberate.** The `ObjectId` is generated up front so `reserveForOrder` can use it without a row existing. A refused hold therefore burns neither a DB row nor an order number. The only case requiring manual unwind is a hold taken but the subsequent write failing (handled in `catch`); a crash between the two leaves a stale hold that the reservation sweep expires.
- **`paymentMethod: undefined` ≡ `'card'`.** No transfer reference is minted; no hold-length override is applied.
- **`priceFor` receives frozen lines**, not a precomputed total, so the free-above-threshold rule prices the basket actually being written.
- **Scope boundary is explicit:** payment-method validation, open-transfer cap, shipping-address resolution, and cart pre-flight/clearing all remain with the caller. This file only writes and holds.
- The `as Partial<OrderDocument>` cast on `orderData` is required because the conditional spreads widen the type past what the repository's typed input can narrow.
- The `OrderSuperseded` error is the *only* mechanism to abort the transaction from `commitWith`; it is not exported.
