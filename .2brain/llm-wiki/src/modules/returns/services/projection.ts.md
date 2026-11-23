---
source: src/modules/returns/services/projection.ts
generated_at: 2026-11-22T07:31:16.022936+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/projection.ts

## Purpose
Keeps the `returnStatus` shown on an order in step with the returns attached to it. The `orders` module cannot read the returns module, so after any change to a return the returns module works out the status itself and reports it to `orders` through `orders`' public API. The report is a projection of a fact that has already been decided. A failed report is logged and never thrown.

## Key elements
- `syncReturnStatus(orderId: string): Promise<void>` is the only export.
  - It loads the order's returns and the order in parallel.
  - If the order is not found, it does nothing.
  - It collects the lines of `cancellation`-kind returns as "canceled" quantities.
  - It computes returnable quantities from the order items, excluding goods for which `isExcludedFromWithdrawal` is true, minus the canceled quantities.
  - It passes the returns (status, kind, remedy, wire-format lines) and the returnable quantities to `projectReturnStatus`.
  - It reports the result to `orders` through `orderService.markReturnStatus`.
  - The returned promise never rejects.

## Relationships
- **`src/modules/returns/repository.ts`**: `returnRepository.findByOrderId` supplies the returns.
- **`src/modules/returns/domain/index.ts`** (with `quantities.ts` and `status-projection.ts` behind it): provides the pure logic. `projectReturnStatus` computes the status word. `returnableLinesOf` and `returnableQuantities` compute what can still be returned. `wireLines` converts lines to the wire format.
- **`src/modules/orders/index.ts`** (with `src/modules/orders/services/index.ts` and `src/modules/orders/domain/withdrawal.ts` behind it): the order module's public entry point. This file imports `orderService` (used for `getById` and `markReturnStatus`) and `isExcludedFromWithdrawal` from it. `isExcludedFromWithdrawal` comes from the withdrawal domain.
- **`src/infrastructure/adapters/logger.ts`**: its `logger` records failed reports via `error`.
- **`cancel-remainder.ts`, `cancel.ts`, `close.ts`, `create.ts`, `decide.ts`, `receive.ts`** are sibling services. They are the moves that change what a return holds (opened, decided, received, closed, canceled). The header comment says the sync runs after such moves.

## Notes
- It is idempotent: the same returns always produce the same status. A failed report is therefore recovered by the next move, which re-stamps the status.
- Excluded goods, and units canceled before they shipped, are left out of the returnable quantities. Neither can stop an order from reading `returned`.
- Errors from any step, including loading the returns, are swallowed and logged. The logging block is wrapped in `Stryker disable all` / `Stryker restore all`, so mutation testing skips it.
