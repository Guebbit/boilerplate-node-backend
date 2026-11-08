---
source: src/modules/payments/services/stats.ts
sha256: ae4d5abc409eef713dc485a2bc7eb7f592257e64cc3a76ff7983cccb24e059f4
generated_at: 2026-11-08T07:29:50.332034+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/stats.ts

## Purpose

Computes the payments "mix" for reporting: how much money came in, grouped by payment method, provider, and currency. It wraps the raw repository aggregation into a clean, typed result suitable for display or further processing.

## Key elements

- **`MixRow`** (interface) — one grouped bucket: `method`, `provider`, `currency`, `payments` (count), `amount` (as `Money`).
- **`methodMix(window)`** (function, exported) — fetches payments that *took money* (i.e. `succeeded`, regardless of later refund) within the given half-open `ReportWindow`, grouped by method + provider + currency. Returns `Promise<MixRow[]>`.

## Relationships

- **`src/domain-primitives/money.ts`** — imports `toMinorUnits` (to convert the raw numeric amount into a `Money` value) and the `Money` type used in `MixRow`.
- **`src/infrastructure/persistence/report.ts`** — imports the `ReportWindow` type that defines the query time range.
- **`src/modules/payments/repository.ts`** — calls `paymentRepository.sumMix(window)` to perform the actual aggregation query.
- **`src/modules/payments/services/index.ts`** — barrel file that re-exports this module's public API to consumers.
- **`src/types/index.ts`** — provides the `PaymentMethod` union type used in `MixRow`.

## Notes

- "Took money" means the payment reached the `succeeded` state; a later refund does **not** remove it from the mix. Payments that never settled (e.g. pending/failed) are excluded.
- The repository returns `_id` as a compound key (`{ method, provider, currency }`); this service flattens that into top-level fields on `MixRow`.
- The file is a pure function service — no side effects, no state. It exists to keep the `Money` conversion and shape-mapping logic out of the repository layer.
