---
source: src/modules/returns/services/projection.ts
sha256: 688858c02faa92139781a81531a32f421eecec0a3f93e735f9f9221333d1375b
generated_at: 2026-11-08T08:05:22.772914+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/projection.ts

## Purpose
Keeps the `orders` module's `returnStatus` field in step with the returns attached to an order. Because `orders` cannot import this module, this file acts as the bridge: after any state-changing return operation, it reads the order's returns, computes the correct status word, and reports it back through the orders module's own public API (`orderService.markReturnStatus`).

## Key elements
- **`syncReturnStatus(orderId: string): Promise<void>`** — The sole export. Loads the order's returns and the order itself in parallel, filters out cancellation lines, computes the projected status via the domain helpers, and writes it back through `orderService.markReturnStatus`. Always resolves; on failure it logs and swallows the error.

## Relationships
- **`src/infrastructure/adapters/logger.ts`** — Imported as `logger`; used in the `catch` block to record projection failures.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — Provides `orderService` (`getById`, `markReturnStatus`) and `isExcludedFromWithdrawal`. This is the "own door" through which the status word is reported.
- **`src/modules/orders/domain/withdrawal.ts`** — Source of `isExcludedFromWithdrawal`, used to determine which order items are returnable.
- **`src/modules/returns/domain/index.ts`** — Barrel export supplying `projectReturnStatus`, `returnableLinesOf`, `returnableQuantities`, and `wireLines`.
- **`src/modules/returns/domain/status-projection.ts`** — Likely origin of `projectReturnStatus`, the function that turns a set of returns into the status word.
- **`src/modules/returns/domain/quantities.ts`** — Likely origin of `returnableLinesOf` and `returnableQuantities`.
- **`src/modules/returns/repository.ts`** — Provides `returnRepository.findByOrderId` to load the order's current returns.
- **`src/modules/returns/services/cancel.ts` / `cancel-remainder.ts` / `close.ts` / `create.ts` / `decide.ts` / `receive.ts`** — The six operations that mutate a return and therefore call `syncReturnStatus` to re-stamp the order's status.

## Notes
- **Never throws.** The `catch` block logs via `logger.error` and resolves `undefined`. Rationale (stated in the module docblock): the projection is a *report* of an already-decided fact; the next state-changing move will re-stamp it, so a transient failure is non-fatal.
- **Idempotent.** The same set of returns always produces the same status word, so safe to call repeatedly.
- **Cancellation lines are special-cased.** Returns with `kind === 'cancellation'` are extracted and passed as the `canceled` argument to `returnableQuantities`, meaning they do *not* block the order from reading `returned`. Excluded-from-withdrawal items are likewise excluded from the returnable set.
- **Stryker mutation testing is disabled** on the `logger.error` call in the `catch` block (explicit `Stryker disable all` / `Stryker restore all` markers).
