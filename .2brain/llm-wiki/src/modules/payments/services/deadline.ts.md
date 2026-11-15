---
source: src/modules/payments/services/deadline.ts
sha256: f24f9d80428f3c36227ecb3b767aa047f3b00eca3cafd1f570225d49ac3588d5
generated_at: 2026-11-14T21:05:58.121181+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/deadline.ts

## Purpose

Reads the legally stamped refund deadline (date + governing rule) from an already-opened payment record. It exists so callers (e.g. task openers) can date and justify work without re-deriving the rule from scratch; if the law sets no deadline, it returns `undefined` and the caller picks its own date.

## Key elements

- **`refundLegalDue(paymentId, refundId): Promise<RefundDue | undefined>`** — Looks up the payment by ID, finds the matching refund record, calls `refundDueBy` to compute the date, and returns `{ dueBy, dueRule }`. Returns `undefined` when the payment or refund is missing, when the law sets no deadline, or when `dueRule` is absent on the record.

## Relationships

- **`src/modules/payments/domain/index.ts`** — Imports `refundDueBy` (computes the deadline date from a refund record) and the `RefundDue` type (shape of `{ dueBy, dueRule }`).
- **`src/modules/payments/domain/lifecycle.ts`** — Likely the defining module for `refundDueBy` / `RefundDue`, surfaced to this file through the `domain/index.ts` barrel.
- **`src/modules/payments/repository.ts`** — Imports `paymentRepository` and calls `.findById(paymentId)` to fetch the payment that carries the refund.
- **`src/modules/payments/services/index.ts`** — Barrel file that re-exports this module so consumers can import from the services package root.

## Notes

- The refund is matched by `String(record._id) === refundId` — a string comparison against the MongoDB `_id`. Ensure callers pass the same string format they received.
- The function requires **both** `refund.dueRule` to be truthy **and** `dueBy` to be defined before returning a result; a record with one but not the other yields `undefined`.
- This is a read-only query; it never mutates the payment or refund.
