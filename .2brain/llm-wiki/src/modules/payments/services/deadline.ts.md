---
source: src/modules/payments/services/deadline.ts
sha256: 15c91861107d8a8e4adb8ce5abd2bbfc0c822b4b72bcf0eec3b2f09166c1b003
generated_at: 2026-10-29T05:09:46.212846+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/deadline.ts

## Purpose

Computes the due instant for a refund on a payment — the legal deadline when one is set, otherwise the "needs-attention" cutoff derived from the refund's creation time. Consumed by the `tickets` flow to date the work item it opens.

## Key elements

- **`refundDueAt(paymentId, refundId): Promise<Date | undefined>`** — the sole export. Resolves to:
  - `refundDueBy(refund)` when a legal deadline exists, or
  - `refund.createdAt + paymentAttentionMinutes() × 60 000 ms` as the fallback, or
  - `undefined` if the payment or the matching refund record is not found.

## Relationships

- **`src/modules/payments/config.ts`** — imports `paymentAttentionMinutes`, the configurable attention threshold (in minutes).
- **`src/modules/payments/domain/index.ts`** — imports `refundDueBy`, the domain rule that extracts a legal deadline from a refund record (when one applies).
- **`src/modules/payments/repository.ts`** — imports `paymentRepository` to load the payment (and its embedded refunds) by ID.
- **`src/modules/payments/services/index.ts`** — barrel that re-exports this module's API to consumers within the services layer.

## Notes

- The refund is located by comparing `String(record._id) === refundId`; callers must pass the string form of the Mongo ObjectId.
- Returns `undefined` (not `null`) for missing data, so callers should guard with a truthy check.
- The attention fallback is computed from the refund's own `createdAt`, not the payment's — a refund created later in a payment's life gets its own independent window.
