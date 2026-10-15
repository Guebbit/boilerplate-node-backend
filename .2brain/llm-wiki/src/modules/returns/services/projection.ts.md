---
source: src/modules/returns/services/projection.ts
sha256: 7fcde70cb6d4ca49dee5b2f86389b239b90619729cb89cdd3f2b3f9292c684fe
generated_at: 2026-10-15T11:57:56.922859+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/projection.ts

## Purpose

Keeps an order's `returnStatus` field in sync with the actual state of its returns. Because the `orders` module cannot import from `returns`, this file reads back the returns after each state-changing move (create, decide, receive, close), computes the correct status word via the domain projection, and writes it back through `orders`' own service API.

## Key elements

- **`syncReturnStatus(orderId: string): Promise<void>`** — The sole export. Fetches all returns and the order in parallel, projects the new status (excluding cancellation lines and withdrawal-excluded lines from the returnable set), and calls `orderService.markReturnStatus`. Never rejects; failures are logged and swallowed.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Logs an error when the status report fails.
- **`src/modules/orders/index.ts`** — Barrel import providing `orderService` (fetch order, report status) and `isExcludedFromWithdrawal` (filter non-returnable items).
- **`src/modules/orders/domain/withdrawal.ts`** — Source of `isExcludedFromWithdrawal`, used to exclude certain goods from the returnable-quantity calculation.
- **`src/modules/orders/services/index.ts`** — Provides `orderService.getById` and `orderService.markReturnStatus`.
- **`src/modules/returns/repository.ts`** — `returnRepository.findByOrderId` reads all returns for the target order.
- **`src/modules/returns/domain/index.ts`** — Barrel import for `projectReturnStatus`, `returnableLinesOf`, `returnableQuantities`, and `wireLines`.
- **`src/modules/returns/domain/status-projection.ts`** — Implements `projectReturnStatus`, the core "returns → status word" logic.
- **`src/modules/returns/domain/quantities.ts`** — Implements `returnableQuantities` / `returnableLinesOf`.
- **`src/modules/returns/services/create.ts`**, **`decide.ts`**, **`receive.ts`**, **`close.ts`**, **`cancel-remainder.ts`** — Callers; each invokes `syncReturnStatus` after mutating a return's state.

## Notes

- **Idempotent by design.** Recomputing from the full returns set means repeated calls converge to the same value; no delta tracking.
- **Failures are logged, never thrown.** The projection reports a fact already decided; the next state-changing move re-stamps it. This is intentional — callers can fire-and-forget.
- **Cancellation lines are subtracted, not added.** Cancellation returns' wire lines are passed as the `cancelled` parameter so they reduce (rather than count toward) the returnable quantity, preventing a pre-shipment cancellation from blocking an order from reaching `returned`.
- **Stryker mutation-testing suppression** wraps the `logger.error` call (`Stryker disable/restore`), so that code path is excluded from mutation coverage.
