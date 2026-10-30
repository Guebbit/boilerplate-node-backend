---
source: src/modules/returns/services/projection.ts
sha256: a4eff05aa0ab26aadfe93e547d4e42cf530345c90a67d29e62908e1fad800fc0
generated_at: 2026-10-29T05:44:26.698435+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/projection.ts

## Purpose

Keeps the `returnStatus` field on an `Order` in sync with the actual returns attached to it. Because the `orders` module cannot import the `returns` module, this file acts as a one-way reporter: after any return state change, it reads the current returns, derives the correct status word, and pushes it into the order via `orderService`. It is idempotent and fire-and-forget—failures are logged, never thrown, since the next state change re-stamps the value.

## Key elements

- **`syncReturnStatus(orderId: string): Promise<void>`** — The sole export. Fetches the order's returns and the order itself in parallel, filters out cancellation lines (which are excluded from "returnable" quantities), computes the projected status via `projectReturnStatus`, and calls `orderService.markReturnStatus`. Resolves on success or after logging an error; never rejects.

## Relationships

- **`src/modules/orders/index.ts`** — Imports `orderService` (to read the order and write the status) and `isExcludedFromWithdrawal` (to determine which items are returnable).
- **`src/modules/orders/domain/withdrawal.ts`** — Origin of `isExcludedFromWithdrawal`.
- **`src/modules/orders/services/index.ts`** — Origin of `orderService`.
- **`src/modules/returns/repository.ts`** — Calls `returnRepository.findByOrderId` to load the order's returns.
- **`src/modules/returns/domain/index.ts`** — Imports `projectReturnStatus`, `returnableLinesOf`, `returnableQuantities`, `wireLines` (re-exported from the submodules below).
- **`src/modules/returns/domain/status-projection.ts`** — Provides `projectReturnStatus`, the pure function that maps return data + quantities to a status word.
- **`src/modules/returns/domain/quantities.ts`** — Provides `returnableLinesOf` and `returnableQuantities`.
- **`src/infrastructure/adapters/logger.ts`** — Logs the error in the catch path.
- **Caller services** (`create.ts`, `decide.ts`, `receive.ts`, `close.ts`, `cancel.ts`, `cancel-remainder.ts`) — Each invokes `syncReturnStatus` after its respective state transition so the order's `returnStatus` stays current.

## Notes

- The catch block carries `// Stryker disable all` / `// Stryker restore all` annotations to exclude the logging-only code from mutation testing (a dead mutation there would be a false positive).
- Cancellation returns are extracted and passed separately into `returnableQuantities` so that units cancelled before shipping do not prevent the order from reaching a `returned` status.
- The function is safe to call redundantly: the same set of returns always yields the same status word, so concurrent or repeated calls are harmless.
