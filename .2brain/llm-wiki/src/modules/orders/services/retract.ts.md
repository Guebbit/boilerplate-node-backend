---
source: src/modules/orders/services/retract.ts
sha256: b0a5d9335342f0a207261fc5347764a999c739045ca9ae722757647897da8b83
generated_at: 2026-09-27T15:15:46.825619+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/retract.ts

## Purpose

Provides a single-undo path for an order that was written by checkout but must not be kept (e.g. a lost `CART_CHANGED` race). It releases the inventory hold and deletes the order row without ever throwing, because the caller has already decided to refuse the request.

## Key elements

- **`retractOrder(order: OrderDocument): Promise<void>`** — The sole export. Sequentially calls `inventoryService.releaseForOrder(orderId)` then `orderRepository.deleteOne(order)`. Each step has an independent `.catch` that logs the failure and resolves `void`, so a failure in one step never prevents the other. The function therefore **never rejects**.
- **`report` (inner helper)** — Closes over `orderId` and `logger`; produces a `(error: unknown) => void` handler that logs `{ message, orderId, error }` via `logger.error`. The raw `Error` object is passed (not a flattened string) so the logger's `redactFormat` can serialize `{name, message, stack}`.
- **Stryker annotations** — The `report` body is wrapped in `Stryker disable/restore all` to suppress mutation-testing noise on a deliberately fire-and-forget logger call.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — The only caller. Invokes `retractOrder` when checkout detects it lost a race (`CART_CHANGED`) and a previously written order must be undone.
- **`src/modules/inventory/index.ts`** → **`src/modules/inventory/service.ts`** — Provides `inventoryService.releaseForOrder(orderId)`, which releases (or deletes) the stock hold row for the given order.
- **`src/modules/orders/model.ts`** — Source of the `OrderDocument` type used as the function parameter.
- **`src/modules/orders/repository.ts`** — Source of `orderRepository.deleteOne(order)`, which removes the persisted order row.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger.error`; its `redactFormat` serialization is relied upon to safely emit the raw `Error` object.
- **`src/modules/orders/services/index.ts`** — Barrel that re-exports this module alongside `place.ts`.

## Notes

- **Order of steps is intentional.** The hold is released *before* the row is deleted so the release call still references a live order. Reversing the order would orphan the hold.
- **No row deletion on a refused reserve.** The file header clarifies that `place.ts` holds stock *before* writing the order, so a failed reserve leaves no order row to delete—only the hold to return. `retractOrder` is only reached when a row *was* written.
- **Errors are swallowed by design.** Because the caller has already chosen to refuse, re-throwing a cleanup failure would incorrectly surface a 500. The only observable signal of a failed cleanup is the log line.
- **`orderId` is coerced with `String(order._id)`** to ensure a stable, JSON-serializable identifier in log context regardless of the BSON `_id` type.
