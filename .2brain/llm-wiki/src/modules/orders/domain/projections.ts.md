---
source: src/modules/orders/domain/projections.ts
sha256: db184f53c5df3be63b5820d814e4347e2c08bf79d49a4fa8186a5697d2203f0b
generated_at: 2026-11-08T06:49:24.299591+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/projections.ts

## Purpose

Defines how the two "adjacent" statuses on an order — Shopify's `financial_status` (payment) and `returnStatus` — are **derived on read** and **queried on write**. Because `orders` cannot import `payments` or `returns`, those modules stamp the stored field through this file's helpers rather than the order module computing them. Everything here is pure (no I/O) so the mappings are trivially unit-testable.

## Key elements

- **`STAMPED_PAYMENT_STATUSES`** / **`StampedPaymentStatus`** — Closed set of refund states (`partially_refunded`, `refunded`) that `payments` may write to the `paymentStatus` field. `unpaid` and `paid` are *derived*, never stored.
- **`STAMPED_RETURN_STATUSES`** / **`StampedReturnStatus`** — Closed set of return states (`requested`, `in_progress`, `partially_returned`, `returned`) that `returns` may write. `none` is the absence of a stamp.
- **`paymentStatusOf(stamped, paidAt)`** — Read-time projection: a stamped refund state wins; otherwise falls back to `paid` (if `paidAt` exists) or `unpaid`.
- **`returnStatusOf(stamped)`** — Read-time projection: the stored stamp, or `'none'` when absent.
- **`paymentStatusFilter(status)`** — Inverse of `paymentStatusOf`; returns a Mongo filter over the raw stored fields (`paymentStatus`, `paidAt`).
- **`returnStatusFilter(status)`** — Inverse of `returnStatusOf`; returns `{ returnStatus: null }` for `'none'`, else `{ returnStatus: status }`.

## Relationships

- **`src/types/index.ts`** — Source of the `OrderPaymentStatus` and `OrderReturnStatus` enums consumed by every export here.
- **`src/modules/orders/domain/index.ts`** — Domain barrel that re-exports the symbols defined in this file so the rest of the module can import them from a single entry point.
- **`src/modules/orders/model.ts`** — The order document carries the stored fields (`paymentStatus`, `paidAt`, `returnStatus`) that these functions read and filter against.
- **`src/modules/orders/services/status.ts`** — The "service door" through which `payments` and `returns` stamp the stored fields; it calls into this file's constants/types to validate what it writes.
- **`src/modules/orders/repository.ts`** — Consumes `paymentStatusFilter` / `returnStatusFilter` to build MongoDB queries for filtered order lookups.
- **`src/modules/orders/tests/unit/projections.test.ts`** — Unit tests exercising every exported function at its boundary values.

## Notes

- `paid` and `unpaid` are **never persisted** in `paymentStatus`; they are reconstructed from `paidAt` at read time. Any code that writes to `paymentStatus` should only write the values in `STAMPED_PAYMENT_STATUSES`.
- `none` is **never persisted** in `returnStatus`; it is the sentinel for "no stamp present." The stored value is always `null` or one of `STAMPED_RETURN_STATUSES`.
- The `satisfies` clauses on both const arrays act as a compile-time guard: if a new enum member is added upstream, the array will fail to satisfy the expected type until a developer explicitly opts in.
- The file is intentionally free of imports from `payments` or `returns` modules — the architectural constraint is the reason it exists as a separate projection layer rather than logic embedded in those modules.
