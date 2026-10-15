---
source: src/modules/payments/services/stats.ts
sha256: 61233d3c4fbf4008846cc3d6744785a1b26cfcbaa1c66ddcb4525643e3e7b06b
generated_at: 2026-10-15T11:32:25.256110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/stats.ts

## Purpose

Computes the payments "mix" — a breakdown of how much money came in, grouped by payment method, provider, and currency — for a given time window. It is the service-layer wrapper that shapes raw repository aggregates into the `MixRow` contract consumed by reporting/staff-read APIs.

## Key elements

- **`MixRow`** (exported interface) — one row in the mix table: `method`, `provider`, `currency`, `payments` (count), and `amount` (`Money`, in minor units).
- **`methodMix(window: ReportWindow): Promise<MixRow[]>`** (exported function) — calls `paymentRepository.sumMix`, then maps each raw row into a `MixRow`, converting the numeric `amount` into a `Money` value via `toMinorUnits`.

## Relationships

- **`src/modules/payments/repository.ts`** — sole data source; `methodMix` delegates to `paymentRepository.sumMix(window)`.
- **`src/shared-kernel/money.ts`** — provides `toMinorUnits` (used for the amount conversion) and the `Money` type (used in `MixRow`).
- **`src/infrastructure/persistence/report.ts`** — provides the `ReportWindow` type that defines the half-open time-window parameter.
- **`src/types/index.ts`** — provides the `PaymentMethod` union type used in `MixRow`.
- **`src/modules/payments/services/index.ts`** — barrel file that re-exports this module so callers import from the services entry point.
- **`src/modules/payments/tests/integration/staff-reads.test.ts`** — integration test that exercises the staff-reads flow, which calls `methodMix`.

## Notes

- The repository returns rows keyed by a compound `_id` (`{ method, provider, currency }`). This file only destructures that key; callers never see `_id` directly.
- `row.amount` from the repository is a raw number (major units). `toMinorUnits` converts it to minor units (e.g. cents). Consumers of `MixRow.amount` should treat the value as minor-unit integer, not a display-ready string.
- The "only money that actually moved" filter (succeeded payments, regardless of refund status; unsettled payments excluded) is enforced inside `paymentRepository.sumMix`, not here. This file performs no status filtering.
