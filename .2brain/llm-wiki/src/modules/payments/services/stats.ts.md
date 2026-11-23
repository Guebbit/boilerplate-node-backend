---
source: src/modules/payments/services/stats.ts
source_sha256: 7af2495ab056b0ac0e660f962007e8a0d9199300f99b13fff5d5e3dbcdb0dcd3
context_sha256: 75fcba3785845d751f8a16de5ae1cc508b09dc8446f50bd5a3e62e264ac5fa94
generated_at: 2026-11-22T06:53:59.342996+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/stats.ts

## Purpose
Provides the payments mix for the stats: how much money came in, broken down by payment method, provider and currency. It is a thin service layer that reads aggregated sums from the payment repository and converts them into typed rows with `Money` amounts.

## Key elements
- `MixRow` (interface): one row of the mix with `method` (`PaymentMethod`), `provider`, `currency`, `payments` (count) and `amount` (`Money`).
- `methodMix(window)`: takes a `ReportWindow` (half-open) and returns `Promise<MixRow[]>`. It counts payments created in the window that took money, meaning `succeeded` payments whether refunded or not. Payments that never settled are excluded. It delegates to the repository's `sumMix(window)` and maps each row's `_id.method`, `_id.provider` and `_id.currency` plus `payments` and `amount` into a `MixRow`.

## Relationships
- `src/modules/payments/repository.ts`: supplies `paymentRepository`, whose `sumMix` method does the aggregation. Its rows are shaped `{ _id: { method, provider, currency }, payments, amount }`.
- `src/domain-primitives/money.ts`: provides `toMinorUnits`, which turns each row's raw `amount` into `Money` using the row's currency, and the `Money` type.
- `src/infrastructure/persistence/report.ts`: provides the `ReportWindow` type for the time window.
- `src/types/index.ts`: provides the `PaymentMethod` type.
- `src/modules/payments/services/index.ts`: a sibling index in the same services folder. The file shown does not reference it.

## Notes
- The "took money" filtering is not done in this file. It is documented here but implemented by `sumMix` in the repository.
- Rows are grouped per method, provider and currency, so the same method and provider can appear more than once if several currencies are involved. Amounts are never summed across currencies here.
