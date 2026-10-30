---
source: src/modules/payments/services/stats.ts
sha256: ae4d5abc409eef713dc485a2bc7eb7f592257e64cc3a76ff7983cccb24e059f4
generated_at: 2026-10-29T05:14:09.126223+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/stats.ts

## Purpose

Computes the "payments mix" statistic: how much money came in broken down by payment method, provider, and currency within a given reporting window. It translates raw aggregate rows from the persistence layer into a clean `MixRow` shape suitable for reporting.

## Key elements

- **`MixRow` (interface)** — One row of the mix: `method`, `provider`, `currency`, count of `payments`, and total `amount` as a `Money` value.
- **`methodMix(window: ReportWindow): Promise<MixRow[]>`** — Fetches aggregated payment sums for a half-open time window and maps each raw row to a `MixRow`, converting the raw amount to minor units via `toMinorUnits`.

## Relationships

- **`src/domain-primitives/money.ts`** — Imports `toMinorUnits` (function) and `Money` (type) to normalize monetary amounts in the result.
- **`src/infrastructure/persistence/report.ts`** — Imports `ReportWindow` as the parameter type for the time-range query.
- **`src/modules/payments/repository.ts`** — Calls `paymentRepository.sumMix(window)` to retrieve the raw aggregated rows this service shapes.
- **`src/modules/payments/services/index.ts`** — Barrel file that re-exports this module alongside other payment services.
- **`src/types/index.ts`** — Source of the `PaymentMethod` type used in the `MixRow` interface.

## Notes

- Only payments that *took money* (succeeded, refunded or not) are counted; payments that never settled are excluded. This is an invariant enforced upstream in the repository, not here.
- `ReportWindow` is a **half-open** interval (`[start, end)`); callers must not double-count boundary timestamps.
- The raw row's compound key (`_id.method`, `_id.provider`, `_id.currency`) is unpacked into flat fields on `MixRow`; the repository's document structure is not leaked to callers.
