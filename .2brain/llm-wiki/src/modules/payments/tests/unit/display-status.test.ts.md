---
source: src/modules/payments/tests/unit/display-status.test.ts
sha256: 1a1f95091326412fc74155ebcecbb8341d0a6f78c56840157df599d6099df5c9
generated_at: 2026-10-15T11:38:01.440122+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/display-status.test.ts

## Purpose

Unit tests for `displayStatusOf`, which derives the human-facing label of a payment from its stored status, refund list, and `amountRefunded`. The tests encode the precedence rule: an open (pending/failed) refund overrides the stored status, and `amountRefunded` is only consulted when no refund is still open.

## Key elements

- **`describe('displayStatusOf')`** — single top-level block; all assertions target the one imported function.
- **`it.each` table (12 rows)** — covers every `PaymentStatus` × refund-scenario combination: no refunds, a succeeded refund (partial vs. full), an open pending refund, a failed refund, and a mix of settled + open. Verifies the expected `PaymentDisplayStatus` for each.
- **Float-precision test** — asserts that `amountRefunded: 0.1 + 0.2` equals `amount: 0.3` in minor units, confirming the domain function uses integer-safe comparison rather than raw float equality.

## Relationships

- **`src/modules/payments/domain/display-status.ts`** — implements `displayStatusOf`; the sole system under test here.
- **`src/modules/payments/domain/index.ts`** — barrel re-export through which `displayStatusOf` is imported (`@modules/payments/domain`).
- **`src/types/index.ts`** — defines the `PaymentDisplayStatus`, `RefundStatus`, and `PaymentStatus` enums/types used throughout the test setup and assertions (imported as `@types`).

## Notes

- The `base` fixture uses `currency: 'EUR'` and `amount: 50`; individual rows override `amountRefunded` and `refunds`.
- The float test (`0.1 + 0.2 === 0.3`) is intentionally a *positive* assertion: the domain function is expected to handle the classic IEEE-754 artifact, not the test suite.
- The comment at the top of the file documents the refund-rule contract; treat it as the authoritative specification of precedence order.
