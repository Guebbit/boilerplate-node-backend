---
source: src/modules/orders/domain/projections.ts
source_sha256: db184f53c5df3be63b5820d814e4347e2c08bf79d49a4fa8186a5697d2203f0b
context_sha256: f75bd36178b2bc9468dfb099690a0cccbbe43ed2a5e8dbac6e675e529ea9d0d3
generated_at: 2026-11-22T06:12:25.976509+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/projections.ts

## Purpose
Pure, I/O-free mappings for the statuses that sit beside an order's own `status`: Shopify's `financial_status` (payment) and `returnStatus`. Because `orders` cannot import `payments` or `returns`, these values can't be derived on read. They are stored, stamped by the owning module through the orders service, and this file defines the allowed stamps, how to resolve the effective status, and the inverse Mongo filters. (`fulfillment_status` is handled separately in `./fulfillment`.)

## Key elements
- `STAMPED_PAYMENT_STATUSES` / `StampedPaymentStatus` — the refund states `payments` stamps: `partially_refunded`, `refunded`. `unpaid` and `paid` are derived, never stored.
- `STAMPED_RETURN_STATUSES` / `StampedReturnStatus` — the return states `returns` stamps: `requested`, `in_progress`, `partially_returned`, `returned`. `none` is never stored.
- `paymentStatusOf(stamped, paidAt)` — returns the stamped refund state if present; otherwise `paid` if `paidAt` is set, else `unpaid`.
- `returnStatusOf(stamped)` — returns the stamp, or `none` if absent.
- `paymentStatusFilter(status)` — builds the Mongo filter that is the inverse of `paymentStatusOf`:
  - `paid` → `{ paymentStatus: null, paidAt: { $ne: null } }`
  - `unpaid` → `{ paymentStatus: null, paidAt: null }`
  - any other status → `{ paymentStatus: status }`
- `returnStatusFilter(status)` — the inverse of `returnStatusOf`: `none` → `{ returnStatus: null }`, otherwise `{ returnStatus: status }`.

## Relationships
- Imports `OrderPaymentStatus` and `OrderReturnStatus` from `src/types/index.ts` (`@types`).
- `src/modules/orders/tests/unit/projections.test.ts` is the unit test for these pure mappings.
- The remaining neighbors (`src/modules/orders/domain/index.ts`, `src/modules/orders/model.ts`, `src/modules/orders/repository.ts`, `src/modules/orders/services/status.ts`) are related in the dependency graph, but nothing in this file's content shows how they use it. By its docs, the stamping happens through the orders service, and the stored fields (`paymentStatus`, `paidAt`, `returnStatus`) are the ones the filters query.

## Notes
- The filters and the `*Of` functions must stay in sync: the stamp field is null/absent for `paid`, `unpaid`, and `none`, so `paid` vs `unpaid` is decided by `paidAt`.
- The filters return `Record<string, unknown>` (untyped Mongo filters).
- A stamped refund state takes precedence over `paidAt` when resolving payment status.
