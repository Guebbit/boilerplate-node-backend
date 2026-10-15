---
source: src/modules/orders/domain/projections.ts
sha256: db184f53c5df3be63b5820d814e4347e2c08bf79d49a4fa8186a5697d2203f0b
generated_at: 2026-10-15T11:02:13.152693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/projections.ts

## Purpose

Provides the read-side projection logic for two "side" statuses on an order — payment (refund) status and return status. Because `orders` cannot import `payments` or `returns`, those modules **stamp** their status onto the order via a service; this file supplies the pure, dependency-free functions that turn the stored stamp (plus `paidAt`) into the caller-facing status, and the inverse Mongo filters used to query by status. `fulfillment_status` is explicitly excluded (see `./fulfillment`).

## Key elements

- **`STAMPED_PAYMENT_STATUSES` / `StampedPaymentStatus`** – the subset of `OrderPaymentStatus` values that are actually stored on the order (`partially_refunded`, `refunded`). `paid` and `unpaid` are derived, never stored.
- **`STAMPED_RETURN_STATUSES` / `StampedReturnStatus`** – the subset of `OrderReturnStatus` values that are stored (`requested`, `in_progress`, `partially_returned`, `returned`). `none` means "no stamp" and is never persisted.
- **`paymentStatusOf(stamped, paidAt)`** – returns the effective `OrderPaymentStatus`: stamped refund state wins; otherwise `paid` if `paidAt` is set, `unpaid` if not.
- **`returnStatusOf(stamped)`** – returns the effective `OrderReturnStatus`: stamped value or `none`.
- **`paymentStatusFilter(status)`** – builds a Mongo filter object that is the *inverse* of `paymentStatusOf`, so a caller filtering by `paid`/`unpaid` correctly checks `paidAt` while filtering by a refund state checks the stored `paymentStatus` field.
- **`returnStatusFilter(status)`** – Mongo filter inverse of `returnStatusOf`; `none` maps to `returnStatus: null`.

## Relationships

- **`src/types/index.ts`** — imports `OrderPaymentStatus` and `OrderReturnStatus`; the constants and function signatures in this file are anchored to those unions.
- **`src/modules/orders/model.ts`** — defines the Order shape carrying the `paymentStatus`, `returnStatus`, and `paidAt` fields that these functions read and filter against.
- **`src/modules/orders/services/status.ts`** — the "service door" through which `payments` and `returns` stamp their status onto an order; the stamps produced here are what `paymentStatusOf` / `returnStatusOf` consume.
- **`src/modules/orders/repository.ts`** — consumes `paymentStatusFilter` and `returnStatusFilter` to build Mongo queries when listing/searching orders by status.
- **`src/modules/orders/domain/index.ts`** — barrel that re-exports this module's symbols to the rest of the `orders` domain.
- **`src/modules/orders/tests/unit/projections.test.ts`** — unit tests exercising the pure derivation and filter functions at their edges.

## Notes

- This file is **pure** (no I/O, no DI); every function is a plain mapping, which is why it can be tested in isolation.
- The filter functions are the *inverse* of the derivation functions. If you add a new stamped status, you must update both the `STAMPED_*` constants **and** the corresponding `*Filter` function, or queries will silently miss records.
- `paid`/`unpaid` are **not** in `STAMPED_PAYMENT_STATUSES` by design — they are derived from `paidAt`. Do not add them to the stamped list; doing so would break the filter logic that checks `paidAt` for those two values.
- `fulfillment_status` is deliberately absent from this file. It reads a `delivery` summary and is projected in a sibling module (`./fulfillment`) to avoid a circular dependency.
