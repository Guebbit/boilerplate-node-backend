---
source: src/modules/orders/services/place.ts
sha256: ff219946dc2f0befeea0070994909da0337dab2b6fc7f50be947585f9e0b1dbb
generated_at: 2026-09-27T15:15:24.567878+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/place.ts

## Purpose

The single write path for creating a new order row. Both `crud.ts`'s admin `create` and `@modules/cart`'s checkout delegate to `placeOrder`, so the actual insert exists in exactly one place. The function freezes line items, reserves stock, allocates an order number, and persists the document—returning a plain verdict rather than an HTTP envelope.

## Key elements

- **`placeOrder(input: PlaceOrderInput): Promise<PlaceOrderOutcome>`** — The sole exported function. Validates lines via `checkOrderLines`, freezes them, reserves stock, allocates the order number, writes the row, and emits `ORDER_CREATED`. On failure at any stage, returns a typed verdict (never throws for business rejections).
- **`PlaceOrderInput`** — Everything the write needs: buyer identity, pre-resolved lines, optional `paymentMethod`, optional `PlaceOrderShipping`, and optional free-text `notes`.
- **`PlaceOrderShipping`** — Caller-resolved shipping. Notably, `method.priceFor` is a *function* that receives the frozen lines, not a precomputed number, so pricing always reflects the actual basket being bought.
- **`PlaceOrderLine`** — Pairs the request's `{productId, quantity}` with its resolved `ProductSnapshot | null | undefined`.
- **`PlaceOrderOutcome`** — Discriminated union: `{ ok: true; order }` or one of three failure reasons (`no-lines`, `product-missing`, `insufficient-stock` with `shortfalls`).

## Relationships

- **`@modules/inventory` (`service.ts` / `index.ts`)** — Calls `inventoryService.reserveForOrder` (before the write) and `releaseForOrder` (in the catch block if the write fails after a successful hold). Imports `StockShortfall` for the insufficient-stock verdict.
- **`../domain/rules.ts`** — Calls `checkOrderLines` as the first gate; returns the same `no-lines`/`product-missing` reasons verbatim.
- **`../domain/transfer-reference.ts`** — Calls `buildReference(orderId)` when `paymentMethod === 'bank_transfer'`, minting the reference against the pre-generated ObjectId.
- **`./order-numbering.ts`** — Calls `allocateOrderNumber` inside the `try` block so a throw still releases the hold.
- **`../repository.ts`** — Persists the final document via `orderRepository.create`.
- **`../events.ts`** — Emits the `ORDER_CREATED` domain event (fire-and-forget with `void`).
- **`@kernel/events.ts`** — Provides `emitDomainEvent`.
- **`../config.ts`** — Reads `shopCurrency()` for the order's `currency` field.
- **`@infrastructure/persistence/create-repository.ts`** — Imports `toObjectId` to coerce `userId` for the Mongoose write.
- **`@infrastructure/adapters/logger.ts`** — Logs an error if `releaseForOrder` itself fails in the catch path.
- **`../services/crud.ts`** and **`@modules/cart/services/checkout.ts`** — The two upstream callers that map `PlaceOrderOutcome` to their respective wire shapes (e.g. `ORDER_INSUFFICIENT_STOCK` vs `CART_INSUFFICIENT_STOCK`).
- **`../services/index.ts`** — Re-exports `placeOrder` and its types.

## Notes

- **Hold-before-write is deliberate.** A refused stock hold returns before the order number is allocated and before the row is written—neither resource is burned. The one case still requiring manual unwind is a successful hold followed by a failed write; the catch block releases it. If the release *also* fails, the hold is left to the reservation sweep.
- **`orderId` is pre-generated** (via `new Types.ObjectId()`) so `reserveForOrder` and the bank-transfer reference both reference the *same* id that the row will eventually carry. This prevents a retried `placeOrder` from minting a second transfer reference.
- **`priceFor(frozenLines)`** is called with the *frozen* `orderItems`, not the caller's original lines. This ensures the free-shipping threshold is evaluated against the exact basket being written.
- **The `ORDER_CREATED` event is emitted here, not in a repository hook**, so every future caller of `placeOrder` is guaranteed to announce the order. Emitted fire-and-forget (`void`); a slow listener must not block the response.
- **The `as Partial<OrderDocument>` cast** on the `create` call is required because the conditional spreads (`notes`, `paymentMethod`, `shippingAddress`, etc.) widen the object to a plain index signature that the repository's typed input cannot narrow.
- **Out of scope for this function:** payment-method validation, open-transfer caps, resolving the shipping address/method, cart pre-flight, and cart clearing all remain the caller's responsibility.
