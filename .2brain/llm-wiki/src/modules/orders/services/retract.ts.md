---
source: src/modules/orders/services/retract.ts
sha256: 0e0970f23956f97263e3409c4bc6738f0617d5e228aa8048075b2517a978046f
generated_at: 2026-09-23T19:08:36.633459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/retract.ts

## Purpose

Exports a single compensation function, `retractOrder`, that undoes an already-written order by releasing its inventory hold and deleting the order document. It exists as a standalone module so that `place.ts` (rollback after a failed stock hold) and the cart's `checkout` flow can both invoke it without importing each other.

## Key elements

- **`retractOrder(order: OrderDocument, releaseHold: boolean): Promise<void>`** — The sole export. If `releaseHold` is true, calls `inventoryService.releaseForOrder(orderId)`; then unconditionally calls `orderRepository.deleteOne(order)`. Never rejects: every `.catch` swallows the error into a structured log line so a failed cleanup cannot surface as a 500 and mask the original refusal.
- **`report(message)`** (internal) — Returns a `(error: unknown) => void` callback that calls `logger.error` with the message, `orderId`, and the raw error object. Used as the `.catch` handler on both steps.

## Relationships

- **`src/modules/orders/services/place.ts`** — Calls `retractOrder` to roll back an order when a stock-hold write fails mid-transaction.
- **`src/modules/cart/services/checkout.ts`** — Calls `retractOrder` when a later checkout step refuses the order.
- **`src/modules/orders/services/index.ts`** — Barrel re-export; consumers import `retractOrder` through this path.
- **`src/modules/inventory/index.ts` / `service.ts`** — Source of `inventoryService.releaseForOrder`, the first step of the undo.
- **`src/modules/orders/repository.ts`** — Provides `orderRepository.deleteOne`, the second (final) step.
- **`src/modules/orders/model.ts`** — Supplies the `OrderDocument` type used in the function signature.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance used in the catch handlers.

## Notes

- **Order of operations is deliberate:** release runs _before_ delete so the release can still reference a live order row.
- **Never rejects by design.** The caller has already decided the order is invalid; a second failure during cleanup must not become a new user-facing error.
- **Logs are the only recovery signal.** A refused reserve deletes its hold row outright, so no background sweep will surface it. The two `logger.error` calls (`Rollback: hold not released` / `Rollback: order not deleted`) are the sole record a human can find.
- **Raw `Error` object is passed to the logger, not a message string.** `redactFormat` (in `logger.ts`) serialises an `Error` into `{ name, message, stack }` before JSON output; passing a plain string would lose the stack.
- **Stryker mutation testing is disabled** around the `logger.error` call because mutating a void-returning log statement has no observable effect.
