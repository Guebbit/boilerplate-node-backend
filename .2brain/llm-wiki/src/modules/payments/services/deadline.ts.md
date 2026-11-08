---
source: src/modules/payments/services/deadline.ts
sha256: 2a8868647aa2bce2eda50f8a7ff4cbb224d8dbf4a008285b6976d14e9d49f9b7
generated_at: 2026-11-08T07:25:20.726351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/deadline.ts

## Purpose

Provides the single service-level lookup for a refund's legal processing deadline. `tasks` calls it to date the work item it opens; when the law imposes no deadline (or the record is missing) it resolves to `undefined`, letting the caller choose its own timing.

## Key elements

- **`refundLegalDueAt(paymentId: string, refundId: string): Promise<Date | undefined>`** — exported async function. Fetches the payment by ID, locates the matching refund record (string-comparing `_id`), and returns `refundDueBy(refund)`. Resolves to `undefined` if the payment is absent, the refund record is not found, or the domain function itself yields no deadline.

## Relationships

- **`src/modules/payments/domain/index.ts`** — source of `refundDueBy`, the domain function that actually derives the legal deadline from a refund record. This file is a thin service wrapper over it.
- **`src/modules/payments/repository.ts`** — provides `paymentRepository.findById`, the data access used to load the payment (and its embedded `refunds` array).
- **`src/modules/payments/services/index.ts`** — barrel file for the `services` directory; re-exports this module so consumers import from the services index rather than the leaf path.

## Notes

- The "deadline" logic is **not** here; this file only resolves *which* refund record to feed into the domain function. All date arithmetic lives in `refundDueBy` (domain layer).
- Lookup failures (missing payment, missing refund ID) resolve to `undefined` rather than throwing. Callers must explicitly handle the `undefined` case.
- The refund is matched with `String(record._id) === refundId`, implying `_id` is stored as an `ObjectId` while callers pass a plain string — do not pass an `ObjectId` directly.
