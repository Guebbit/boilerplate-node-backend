---
source: src/infrastructure/persistence/report.ts
sha256: 541b6b602d03baa9303a1ac8afa0db37966638dcce2c5240af1207fe801085dc
generated_at: 2026-11-08T03:44:04.605793+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/report.ts

## Purpose

Shared building blocks for MongoDB grouped reads used across stats endpoints: a half-open time window with a bucket interval and IANA time zone, plus the `$dateTrunc` aggregation expression that buckets a date field in that zone. It is intentionally module-agnostic so every owner module (invoicing, orders, payments, returns) reuses the same window/bucketing contract without duplicating logic.

## Key elements

- **`ReportInterval`** (type) — the three allowed bucket sizes: `'day' | 'week' | 'month'`.
- **`ReportWindow`** (interface) — the shape a grouped read is asked about: `from` (included), `to` (excluded), `interval`, and `timeZone` (IANA string defining where local midnight cuts the bucket).
- **`bucketOf(field, window)`** (function) — returns a ready-to-embed `$dateTrunc` aggregation object for a given date field. Emits `startOfWeek: 'monday'` only when `interval === 'week'`; omits it otherwise.

## Relationships

- **Consumed by** `src/modules/invoicing/repository.ts`, `src/modules/payments/repository.ts`, `src/modules/returns/repository.ts` — these repositories embed `bucketOf` in their aggregation pipelines for grouped reads.
- **Consumed by** `src/modules/invoicing/services/stats.ts`, `src/modules/orders/services/stats.ts`, `src/modules/payments/services/stats.ts`, `src/modules/returns/services/stats.ts` — stats services build a `ReportWindow` and pass it into the corresponding repository.
- **`src/modules/stats/services/range.ts`** — provides the time-range logic that populates the `from`/`to`/`timeZone` fields of a `ReportWindow` before it reaches a stats service.
- **Tested by** `tests/unit/infrastructure/persistence/report.test.ts`.

## Notes

- The window is **half-open**: `from` is inclusive, `to` is exclusive. Callers must not treat `to` as included.
- `startOfWeek` is hard-coded to `'monday'` and only sent for the `week` interval; other intervals ignore it.
- The file carries no MongoDB driver import; it produces plain aggregation objects, leaving the actual query execution to the consuming repositories.
- Money values aggregated via `$sum` are Decimal128 and are read as minor units per currency by `toMinorUnits` from `@domain-primitives/money` (referenced in the module doc-block but not imported here).
