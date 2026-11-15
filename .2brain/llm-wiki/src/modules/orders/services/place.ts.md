---
source: src/modules/orders/services/place.ts
sha256: 9c165b9590ad5e00eef2eb6bc3f3502db8b010e36bab6adf0518ecd1de88cb36
generated_at: 2026-11-14T20:44:55.565231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/place.ts

## Purpose

The single write path for creating a new order. Both the admin `create` endpoint (`crud.ts`) and the cart checkout service funnel through `placeOrder`, so the "write an order" logic exists in exactly one place. It freezes line items, holds stock, allocates an order number, and persists the row — with the hold taken *before* the write so a refused hold burns neither a DB row nor an order number.

## Key elements

- **`placeOrder(input: PlaceOrderInput): Promise<PlaceOrderOutcome>`** — The sole public entry point. Validates lines via `checkOrderLines`, freezes them, reserves stock via `inventoryService.reserveForOrder`, allocates an order number, writes the `OrderDocument` through `orderRepository`, and fires the created-event outbox row via `announceInTransaction`. Never throws on a business refusal; returns a `PlaceOrderOutcome` verdict instead.
- **`PlaceOrderOutcome`** — Discriminated union: `{ ok: true; order }` or `{ ok: false; reason: 'no-lines' | 'product-missing' | 'insufficient-stock' | 'superseded' }`. Callers map it to their own wire shapes.
- **`PlaceOrderInput`** — Full input contract. Notable fields: `commitWith` (optional callback run inside the transaction for atomic cart-clear; returning `false` aborts the whole transaction as `superseded`), `termsAccepted`, `paymentMethod`, `shipping`, `billingAddress`, `notes`.
- **`PlaceOrderLine`** — A line with its resolved `ProductSnapshot` (or `null`/`undefined` for missing) and optional `backorder` hint.
- **`PlaceOrderShipping`** — Caller-resolved shipping; `method.priceFor` is a function of frozen lines rather than a precomputed number.
- **`OrderSuperseded`** (internal) — Thrown inside the transaction to trigger rollback when `commitWith` reports a lost race.
- **`withOwedLines`** (internal) — Annotates frozen items with backorder owed-quantity and promise date using `owedLineOf`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/inventory/index.ts` | Imports `inventoryService` to call `reserveForOrder` (hold stock) and re-exports used types. |
| `src/modules/inventory/services/index.ts` | Source of the `inventoryService` instance (re-exported through the barrel above). |
| `src/modules/inventory/services/types.ts` | Provides the `StockShortfall` type consumed in the `insufficient-stock` verdict. |
| `src/kernel/outbox.ts` | Calls `announceInTransaction` to write the created-event outbox row atomically with the order. |
| `src/modules/orders/services/announce.ts` | Imports `createdEvent` (the event payload) for the outbox call. |
| `src/infrastructure/adapters/logger.ts` | Imports `logger` for diagnostic logging. |
| `src/infrastructure/persistence/create-repository.ts` | Imports `toObjectId` to coerce `userId` to an `ObjectId` before the write. |
| `src/modules/account/index.ts` | Imports `termsVersion` to snapshot the active terms version when `termsAccepted` is set. |
| `src/modules/orders/domain/rules.ts` | Calls `checkOrderLines` as the first validation gate; maps its failure into the verdict. |
| `src/modules/orders/domain/backorder.ts` | Calls `owedLineOf` inside `withOwedLines` to derive backorder promise dates. |
| `src/modules/orders/model.ts` | Types the draft as `Partial<OrderDocument>` / `OrderDocumentItem`. |
| `src/modules/orders/repository.ts` | Writes the final row via `orderRepository`. |
| `src/modules/cart/services/checkout.ts` | Upstream caller; maps `PlaceOrderOutcome` to its own wire shape and passes `commitWith` for cart clearing. |
| `src/modules/delivery/tests/unit/fulfillment.test.ts` | Test consumer that exercises the order-placement flow end-to-end. |

## Notes

- **Hold-before-write is deliberate.** The `ObjectId` is generated up front so `reserveForOrder` can use it without a row existing. A failed hold returns early with zero side effects. A hold that succeeds but whose subsequent write fails is the one case requiring manual unwind (release the hold); a crash between the two leaves only an expiring reservation.
- **`commitWith` semantics.** When provided, the callback runs inside the order's Mongoose transaction *after* the order row is written. Returning `false` (e.g., a conditional cart-delete that matched 0 rows) throws `OrderSuperseded`, which rolls back the order, the outbox row, and the hold together — the verdict is `superseded`.
- **`paymentMethod` default.** `undefined` behaves identically to `'card'`: no reference is minted, no hold-length override is applied. The hold expiry (`payBy`) comes from the inventory service regardless of payment method.
- **`priceFor` receives frozen lines.** Shipping is priced off the post-freeze basket total, not a precomputed number, to avoid a TOCTOU gap between the caller's read and this write.
- **`userId` coercion.** Stored as `ObjectId`; the caller passes a string and this module coerces it via `toObjectId` (same convention as `crud.ts`).
- **Not responsible for:** payment-method validation, open-order cap, address/method resolution, cart pre-flight, or cart clearing — all stay with the caller.
