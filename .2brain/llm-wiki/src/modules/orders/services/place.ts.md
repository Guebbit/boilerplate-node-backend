---
source: src/modules/orders/services/place.ts
sha256: 53d6ba697949bb854aebf61c6ce749bb558374785223fe0395e7399ee2beb463
generated_at: 2026-10-29T04:48:26.158702+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/place.ts

## Purpose
The single write path for creating a new order row. Both `crud.ts`'s admin `create` and the cart `checkout` service funnel through `placeOrder`, ensuring the write (freeze lines → hold stock → allocate number → persist) exists in exactly one place. Callers remain responsible for payment validation, order caps, address resolution, and cart pre-flight.

## Key elements
- **`placeOrder(input: PlaceOrderInput): Promise<PlaceOrderOutcome>`** — The sole export. Validates lines via `checkOrderLines`, freezes snapshots, reserves inventory, allocates an order number, writes the order document (with timeline and outbox event) inside a Mongoose session, and returns a plain verdict. Never throws on a business refusal.
- **`PlaceOrderInput`** — Everything the write needs: user identity, lines (with optional per-line backorder flag), optional shipping (address + `priceFor` callback), optional `billingAddress`, `notes`, and a `commitWith(session)` hook that runs in the same transaction (used by checkout to clear the cart atomically).
- **`PlaceOrderLine`** — A request line (`{productId, quantity}`) paired with its resolved `ProductSnapshot | null | undefined` and an optional `backorder` flag carrying a `restockDate`.
- **`PlaceOrderShipping`** — Pre-resolved address and method; `method.priceFor` receives the *frozen* lines so free-shipping thresholds price the actual basket. `holdMinutes` overrides the inventory hold TTL.
- **`PlaceOrderOutcome`** — Discriminated union: `{ok:true, order}` or `{ok:false, reason}` where reason is `'no-lines' | 'product-missing' | 'insufficient-stock' | 'superseded'`. Not an HTTP envelope.
- **`OrderSuperseded`** — Internal error class thrown to abort the transaction when `commitWith` resolves `false`.
- **`withOwedLines`** (internal) — Merges per-line backorder/owed metadata into the frozen items using `owedLineOf` before the write.

## Relationships
- **`@modules/inventory` / `inventoryService`** — Calls `reserveForOrder(orderId, lines, holdMinutes)` to hold stock *before* the order row is written. Reads `outcome.held`, `outcome.shortfalls`, `outcome.owed`, and `outcome.expiresAt`.
- **`../repository` (`orderRepository`)** — Persists the order document inside the session passed by `announceInTransaction`.
- **`@kernel/outbox` (`announceInTransaction`)** — Wraps the repository write so the `order.created` outbox row commits in the same transaction as the order (and any `commitWith` step).
- **`./announce` (`createdEvent`)** — Supplies the event payload for the outbox row.
- **`./timeline` (`appendTimeline`)** — Opens the order timeline within the same transaction.
- **`./snapshot` (`freezeOrderLines`)** — Produces the immutable `OrderDocumentItem[]` from resolved products and quantities.
- **`./order-numbering` (`allocateOrderNumber`)** — Spends the next order number; called inside the `try` block so a failure releases the hold.
- **`../domain/rules` (`checkOrderLines`)** — Pre-flight validation of quantities and product presence.
- **`../domain/backorder` (`owedLineOf`)** — Computes owed quantity and promised restock date for backorder lines.
- **`@infrastructure/persistence/create-repository` (`toObjectId`)** — Coerces the `userId` string to an `ObjectId` for the document.
- **`@infrastructure/adapters/logger`** — Imported for structured logging (available in the full file).
- **`../services/crud.ts` / `@modules/cart/services/checkout.ts`** — The two callers that map `PlaceOrderOutcome` to their own wire shapes (`ORDER_INSUFFICIENT_STOCK` vs `CART_INSUFFICIENT_STOCK`).

## Notes
- **Hold before write.** `reserveForOrder` is called with a pre-generated `ObjectId` *before* `allocateOrderNumber` and `orderRepository.create`. A refused hold therefore burns neither a row nor a number. A hold taken but followed by a failed write is the only case requiring manual unwind (catch block releases the hold).
- **`commitWith` atomicity.** When checkout passes `commitWith`, a `false` result (lost cart-clear race) throws `OrderSuperseded`, aborting the entire transaction — no order, no outbox row, no hold leak.
- **Shipping prices off frozen lines.** `PlaceOrderShipping.method.priceFor` receives the post-freeze `items`, not the caller's pre-freeze lines, so threshold rules price the basket actually being bought.
- **Verdict, not throw.** Business refusals are returned via `PlaceOrderOutcome`, matching the convention set by `checkOrderLines`. Only infrastructure failures (DB errors, hold-release failure) throw.
- **Conditional spreads in `orderData`.** Optional fields (`notes`, `paymentMethod`, `shippingAddress`, `billingAddress`, `shippingMethod`/`shippingCost`) are spread conditionally, then the whole object is cast `as Partial<OrderDocument>` to satisfy the repository's typed input.
