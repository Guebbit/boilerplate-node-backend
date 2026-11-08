---
source: src/modules/orders/services/guarantee.ts
sha256: 6ed803f1ab1e5c93d5ee8ad86bf2a9d0c6624d836632a48b76fb2a1e00ec3433
generated_at: 2026-11-08T06:57:43.338542+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/guarantee.ts

## Purpose

Implements the one-time guarantee extension for repaired goods under EU Directive 2024/1799. When a repair is performed under the statutory warranty, the order's `conformityUntil` date is pushed forward by twelve months — but only once per order. The `returns` module calls in; `orders` owns the underlying field.

## Key elements

- **`extendGuarantee(orderId, session): Promise<boolean>`** — The sole export. Looks up the order within the caller's Mongoose transaction. If the order has no `conformityUntil` (never shipped) or already carries a `conformityExtendedAt` stamp, it returns `false` without writing. Otherwise it writes the new deadline via `orderRepository.extendConformity` and returns `true`.

## Relationships

- **`src/modules/orders/domain/index.ts`** — Imports `repairedConformityUntil`, the pure function that computes the new twelve-month-out date from the current `conformityUntil`.
- **`src/modules/orders/repository.ts`** — Imports `orderRepository` and calls `findInSession` (read) and `extendConformity` (write), both scoped to the passed-in `ClientSession`.
- **`src/modules/orders/services/index.ts`** — Barrel file that re-exports `extendGuarantee` alongside the other order services.

## Notes

- **Idempotent by design.** The `conformityExtendedAt` check means a second repair on the same order will silently no-op; callers should not assume `true` means "repair processed."
- **Transaction coupling.** The function does not create its own session; it is expected to be called *inside* an existing transaction (the receipt/return flow). Passing `undefined` as `session` would bypass atomicity.
- **Return-value contract.** `false` covers two distinct cases (no deadline yet, already extended). If a caller needs to distinguish them, it must inspect the order separately.
