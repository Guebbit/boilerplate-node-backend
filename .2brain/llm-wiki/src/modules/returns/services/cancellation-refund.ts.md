---
source: src/modules/returns/services/cancellation-refund.ts
source_sha256: daef61710f6653af61e422fc833fac5bcf63f85a401b09707d2c8fde2424618c
context_sha256: 68ba0d8a8e68193f1813925400306ffa6549ecac02137ad2ad1f932f07441a2e
generated_at: 2026-11-22T07:28:29.687355+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/cancellation-refund.ts

## Purpose
Computes what cancelling a fulfillment order's remainder would refund, based on the order and its other returns. It is a single computation shared by two callers: the cancel itself (inside its transaction) and `GET /returns/options`, which quotes the refund before anything is written.

## Key elements
- `cancellationRefundOn(order, earlier, lines)`: the only export. Returns a `RefundBreakdown`.
  - `order`: an `OrderDocument`.
  - `earlier`: every return on the order, as the transaction reads them (`AccountedReturn[]`).
  - `lines`: the product quantities this cancel takes (`ProductQuantity[]`).

How it builds the result:
1. `accountsOf(earlier, order.currency)` summarizes what the other returns and cancels have already settled.
2. It builds an ordered-quantity list and a product-id → unit-price map from `order.items`. Ids are compared as strings (`String(item.product._id)`).
3. It prices each cancelled line at the order's product price, using `'0'` if the product isn't found.
4. `takesLastUnit(ordered, [...accounts.accountedFor, ...lines])` decides whether this cancel takes the last unit.
5. `shippingStillOwed(currency, order.shippingCost ?? '0', accounts.shippingRefunded)` gives the shipping still refundable.
6. All of this goes to `cancellationRefundFor`, which produces the breakdown.

## Relationships
- **`src/modules/returns/domain/index.ts`** (re-exporting `accounting.ts`, `quantities.ts`, `refund-amount.ts`): supplies `accountsOf`, `takesLastUnit`, `shippingStillOwed`, `cancellationRefundFor` and the types `RefundBreakdown`, `AccountedReturn` and `ProductQuantity`. This file only gathers order data and passes it in. The refund rules live in the domain.
- **`@modules/orders`** (`src/modules/orders/index.ts`, `src/modules/orders/model.ts`): provides the `OrderDocument` type. It is a type-only import.
- **`src/modules/returns/services/cancel-remainder.ts`** and **`src/modules/returns/services/options.ts`**: the two callers described in the module doc. The cancel runs it in its transaction, and the options service uses it for the quote.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`**: listed as a graph neighbor. The file content shows no direct interaction.

## Notes
- The function is pure: it does no I/O and writes nothing. Callers supply the returns and order, so the quote and the actual cancel agree as long as they pass equivalent inputs.
- A product missing from the order is priced at `'0'` and a missing `shippingCost` is treated as `'0'`. Neither case raises an error. Amounts are string-typed.
