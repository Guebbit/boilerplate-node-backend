---
source: src/modules/returns/services/options.ts
source_sha256: 8c2114e224662aa305fbc63d73dcd66afdf53da3fe77d3abe96b6533d5ad0549
context_sha256: 5ad496ddafe36c0c0d875ee4998a8f8bacac2e5a95e08faef331414c5ada73c2
generated_at: 2026-11-22T07:30:26.259598+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/options.ts

## Purpose
Computes, in one place, what an order can still send back and what it can still cancel, so clients never re-derive quantities or refunds. It exposes a single read, `getReturnOptions`, which returns the returnable lines, the reasons the caller may name, and the cancelable fulfillment orders with the refund each cancellation would owe.

## Key elements
- **`getReturnOptions(orderId, authContext)`**: the only export. It returns `ResponseSuccess<ReturnOptions>` or a 404 reject (`returns.order-not-found`) when the caller cannot read the order. It loads the order's returns, shipped quantities and cancellable remainders, then builds the payload:
  - `orderId`, `currency`, `reasons`, `exceptions`
  - `returnable`: empty when there are no reasons. Otherwise it is shipped quantities minus goods already coming back, via `returnableQuantities`.
  - `cancelable`: one entry per remainder, with `refundAmount`, `shippingRefund` and a `cancel` boolean.
- **`readableOrder`** (private): staff holding `read:Return` get any order through `orderService.getById`. Everyone else goes through `ownOrder`, so only their own orders.
- **`offeredReasons`** (private): decides which reasons the caller may name.
  - **Buyer:** the reasons whose frozen deadline is still open (`reasonsOpenAt`).
  - **Staff with `update:Return`:** every `ReturnReason`. `exceptions` lists the non-withdrawal reasons already past their deadline, as a preview of what opening them would waive. `staff` is `true`.
  - **Anyone else:** no reasons.
- **`optionLines`** (private): turns a product → quantity map into lines. It drops zero quantities, uses the title the order froze for the product, and sets `withdrawable` to false for withdrawal-excluded products.

## Relationships
- **`@modules/orders`**: provides `orderService`, `isBuyer`, `isExcludedFromWithdrawal` and the `OrderDocument` type.
- **`@modules/delivery`**: `deliveryService` supplies the shipped units and the cancellable remainders per fulfillment order (`remainderOptions`).
- **`@kernel/permissions` and `@kernel/ability`**: `callerForSubject` and `holds` check `read:Return` and `update:Return`.
- **`@infrastructure/http/response`**: `generateSuccess` and `generateReject` build the result.
- **`@infrastructure/i18n`**: `t` localises the 404 message.
- **`../domain` (returns domain)**: provides `holdsReturnedGoods`, `wireLines`, `returnableQuantities`, `isGuaranteeReason`, `isReasonOpen`, `reasonsOpenAt` and `ProductQuantity`.
- **Sibling services**: `cancellationRefundOn` (refund amounts), `frozenDeadlinesOf` (deadlines), `cancelRefusalOf` (cancel permission), `ownOrder` (ownership).
- **`../repository`**: the order's existing returns are read from `returnRepository`.

## Notes
- Excluded goods (Art. 16 withdrawal exclusions) appear in `returnable` only when the caller is staff, or when at least one offered reason is a guarantee reason (`isGuaranteeReason`). A defect or wrong item applies to made-to-order goods too.
- A buyer with no open reasons gets an empty `returnable`, meaning no form is offered.
- `cancel` is `true` exactly when `cancelRefusalOf` returns `undefined`. It reuses the rule the cancel endpoint applies, so the UI never offers an action that would be refused.
- Only returns that pass `holdsReturnedGoods` count against what is returnable.
