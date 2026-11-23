---
source: src/modules/orders/services/place.ts
source_sha256: dbd471f3668c527b5ad9ea78bce67b682417f456ea4835c3a0f218f7ae6fc4c2
context_sha256: dc4cfcea1e342cf54edf9f94cb0fd3e1b1612d40c48da2a0623b15afc7322823
generated_at: 2026-11-22T06:22:03.707478+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/place.ts

## Purpose
Houses `placeOrder`, the single function that writes a new order. Both the admin `create` in `crud.ts` and `@modules/cart` checkout go through it, so the write exists in one place. It freezes the lines, holds the stock, allocates an order number, and writes the order row. It returns a plain verdict rather than an HTTP response.

## Key elements
- **`placeOrder(input)`** – the main export. Returns a `PlaceOrderOutcome` and does not reject on refusals. Steps:
  1. Validate lines with `checkOrderLines`.
  2. Freeze the lines with `freezeOrderLines`.
  3. Pre-generate the order `_id`.
  4. Call `inventoryService.reserveForOrder`.
  5. Derive owed (backorder) lines.
  6. Inside a `try`, allocate the order number and build and write the order draft.
- **`PlaceOrderInput`** – the input shape: `userId?`, `email`, `locale`, `lines`, `paymentMethod?`, `shipping?`, `billingAddress?`, `notes?`, `termsAccepted?`, and `commitWith?`.
- **`PlaceOrderLine`** – `{item: {productId, quantity}, product, backorder?}`. `product` may be `null` or `undefined` when the reference no longer resolves. `backorder` is set by the caller when the product is released and open to backorder, optionally with a `restockDate`.
- **`PlaceOrderShipping`** – `address?`, `method?: {id, priceFor(frozenLines)}`, and `holdMinutes?`. Shipping is priced from the frozen lines.
- **`PlaceOrderOutcome`** – a union: `ok: true` with the order, or `ok: false` with a reason. The reasons are `no-lines`, `product-missing`, `insufficient-stock` (with `shortfalls`), and `superseded`.
- **`OrderSuperseded`** – an internal `Error` subclass. It is thrown inside the transaction to abort it when `commitWith` reports a lost race.
- **`withOwedLines`** – an internal helper. It merges each line's owed quantity and promised date into the frozen items using `owedLineOf` and `BACKORDER_PROMISE_DAYS`.

## Relationships
- **`../domain/rules`** – `checkOrderLines` validates the lines first.
- **`../domain/backorder`** – `owedLineOf` computes the owed-line fields.
- **`@modules/inventory`** (`inventoryService`, `StockShortfall`) – `reserveForOrder` holds stock before the write. Its result supplies `expiresAt` (used as `payBy`), `owed`, and `shortfalls`. Lines are marked `kind: 'backorder'` for preorder products and `spill: true` for backorder lines.
- **`./snapshot`, `./order-numbering`, `./timeline`** – these provide `freezeOrderLines`, `allocateOrderNumber`, and `appendTimeline`.
- **`./announce`** and **`@kernel/outbox`** – `createdEvent` and `announceInTransaction` are imported to announce the order's creation inside the order's transaction.
- **`../repository`** (`orderRepository`) and **`../model`** – these persist the order and supply the `OrderDocument` and `OrderDocumentItem` types.
- **`@infrastructure/persistence/create-repository`** – `toObjectId` coerces `userId`.
- **`@infrastructure/adapters/logger`** – the logger is imported. The visible part of the file does not show how it is used.
- **`@modules/account`** – `termsVersion()` freezes the Terms version when `termsAccepted` is set.
- **`@modules/shop`** – `shopCurrency()` and `BACKORDER_PROMISE_DAYS`.
- **`src/modules/cart/services/checkout.ts`** – a caller. It passes `commitWith` to clear the cart in the same transaction.

## Notes
- **Hold before write.** A refused hold writes no row and spends no order number. If the order number allocation or the write fails after the hold, the code is meant to release the hold. A crash between the two leaves only a hold, which the reservation sweep expires.
- **Held stock is not sold.** Stock stays on the shelf until payment lands or the hold ends.
- **Hold expiry.** The hold's `expiresAt` becomes `payBy` for every payment method.
- **Guest orders.** An order with no `userId` (walk-in, staff-placed) gets `piiClockStartedAt` set immediately, so the email follows the retention cleanup.
- **`commitWith` aborts the transaction.** If it resolves `false` or rejects, the order and its `order.created` event are rolled back. A `false` result gives the `superseded` verdict.
- **Out of scope.** Payment-method validation, the open-order cap, shipping address and method resolution, cart pre-flight, and cart clearing all stay with the caller.
- **Optional fields.** The order draft uses conditional spreads, so optional fields such as `notes`, `paymentMethod`, and the addresses are omitted entirely when absent.
- **Lint suppression.** The `try` block carries an `eslint-disable no-restricted-syntax` comment because of the partial-rollback pattern.
