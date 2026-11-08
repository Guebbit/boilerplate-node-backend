---
source: src/modules/payments/tests/unit/display-status.test.ts
sha256: 3d1bb82d557e351bf538a91134e365768f6ed016881659d9310b5d7160a235b4
generated_at: 2026-11-08T07:39:35.399457+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/display-status.test.ts

## Purpose

Unit tests for `displayStatusOf`, the pure function that resolves the human-facing label of a payment. The tests pin down the precedence rule: an open refund overrides the stored `PaymentStatus`, and `amountRefunded` is only consulted when no refund is still pending.

## Key elements

- **`describe('displayStatusOf')`** — single test suite; no helpers, just fixtures and cases.
- **Fixtures** (`open`, `failed`, `settled`, `canceled`, `base`) — pre-built refund arrays and a minimal payment object reused across every case.
- **`it.each<…>` (parameterised matrix)** — 14 rows covering each `PaymentStatus` × refund combination, asserting the exact `PaymentDisplayStatus` returned.
- **Minor-units comparison test** — a standalone `it` verifying that `'0.3'` vs `'0.30'` still reads as `refunded`, i.e. amounts are compared numerically, not as strings.

## Relationships

- **`src/modules/payments/domain/display-status.ts`** — module under test; exports `displayStatusOf`.
- **`src/modules/payments/domain/index.ts`** — barrel file the test imports through (`@modules/payments/domain`), re-exporting `displayStatusOf`.
- **`src/types/index.ts`** — source of the `PaymentStatus`, `RefundStatus`, `RefundFailureReason`, and `PaymentDisplayStatus` types used in fixtures and assertions.

## Notes

- A refund with `status: failed` **and** `failureReason: canceled` (staff-voided) is treated as *closed*, not open. Only `failed` without that reason counts as an open/pending refund. This distinction is easy to miss when adding new rows.
- The `base` object hard-codes `currency: 'EUR'` and `amount: '50.00'`; the minor-units test overrides `amount` to `'0.30'` to exercise the numeric comparison path.
- Amounts are always passed as **strings** (`String(amountRefunded)`) to mirror the real data shape; the test does not pass numbers.
