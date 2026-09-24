---
source: src/modules/orders/services/place.ts
sha256: 695c52d361b65e33aed3a8b0b05baac973c695260e618f083358cfc9d294d1ee
generated_at: 2026-09-23T19:08:15.895894+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/place.ts

## Purpose

Single write path for creating a new order. Both `crud.ts`'s admin `create` and `cart`'s `checkout` funnel their writes through `placeOrder`, so the actual mutation (freezing lines, allocating an invoice number, minting a bank-transfer reference, holding stock) lives in exactly one place. Caller-specific concerns (payment-method validation, open-transfer caps, cart clearing, shipping resolution) stay with the caller.

## Key elements

- **`placeOrder(input: PlaceOrderInput): Promise<PlaceOrderOutcome>`** — the sole function. Validates lines via `checkOrderLines`, freezes them and allocates an invoice number in parallel, pre-generates an `ObjectId` so a `bank_transfer` reference can name the same row it will occupy, writes the document, reserves stock, and rolls back via `retractOrder` if the hold fails. Returns a plain verdict object; never throws on a business refusal.
- **`PlaceOrderLine`** — one request line plus its resolved `ProductSnapshot | null | undefined`.
- **`PlaceOrderShipping`** — caller-resolved address, a `method` whose `priceFor` receives the _frozen_ lines (not a precomputed total), and optional `holdMinutes`.
- **`PlaceOrderInput`** — flat bag of everything the write needs (userId, email, locale, lines, paymentMethod, payBy, shipping, notes).
- **`PlaceOrderOutcome`** — discriminated union: `{ ok: true, order }` or `{ ok: false, reason: 'no-lines' | 'product-missing' | 'insufficient-stock', shortfalls? }`. Callers map this to their own wire error codes.

## Relationships

| Neighbor                                          | Interaction                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `domain/rules.ts`                                 | Calls `checkOrderLines` to reject missing products / empty baskets before any write.               |
| `domain/transfer-reference.ts`                    | Calls `buildReference(orderId)` when `paymentMethod === 'bank_transfer'`.                          |
| `services/snapshot.ts`                            | Calls `freezeOrderLines` to produce the immutable `OrderDocumentItem[]` written to the document.   |
| `services/invoice-numbering.ts`                   | Calls `allocateInvoiceNumber` (run in parallel with freezing).                                     |
| `services/retract.ts`                             | Calls `retractOrder(order, false)` to roll back the just-written document if the stock hold fails. |
| `repository.ts`                                   | Calls `orderRepository.create` for the actual insert.                                              |
| `inventory/index.ts` / `service.ts`               | Calls `inventoryService.reserveForOrder` to hold stock; on failure, triggers the retract path.     |
| `kernel/events.ts`                                | Fire-and-forget `emitDomainEvent(ORDER_CREATED, …)` after a successful write.                      |
| `orders/events.ts`                                | Source of the `ORDER_CREATED` constant.                                                            |
| `orders/model.ts`                                 | Type source for `OrderDocument` / `OrderDocumentItem`.                                             |
| `infrastructure/persistence/create-repository.ts` | Imports `toObjectId` to coerce the string `userId` before the write.                               |
| `cart/services/checkout.ts`                       | Upstream caller; maps `PlaceOrderOutcome` to cart-specific error codes.                            |
| `services/crud.ts`                                | Upstream caller (admin path); maps outcome to its own wire shape.                                  |
| `services/index.ts`                               | Re-exports `placeOrder` and the type exports.                                                      |

## Notes

- The function **never rejects** on a business refusal (empty lines, missing product, insufficient stock). It returns a verdict; callers decide the HTTP shape and error-code prefix.
- The `ObjectId` is generated _before_ `orderRepository.create` so the bank-transfer reference names the same `_id` the row will have. A retried call produces a different id and therefore a different reference — this is what prevents duplicate references for the same logical order.
- `paymentMethod` and `notes` are conditionally spread: `undefined` omits the field entirely from the document rather than writing `null`.
- `shipping.method.priceFor` receives the frozen `orderItems`, not the caller's pre-freeze lines, so the free-above-threshold rule prices the exact basket being persisted.
- The `ORDER_CREATED` event is emitted here (not in `recordCreated`) so that any future caller of `placeOrder` cannot skip the announcement. It is `void`-fire-and-forget; a slow listener must not block the response.
