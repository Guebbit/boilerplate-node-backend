---
source: src/infrastructure/persistence/report.ts
sha256: 541b6b602d03baa9303a1ac8afa0db37966638dcce2c5240af1207fe801085dc
generated_at: 2026-10-29T02:13:30.479602+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/report.ts

## Purpose

Shared building blocks for MongoDB grouped (bucketed) reads used across multiple domain modules. It defines the window/bucket vocabulary (`ReportWindow`, `ReportInterval`) and the single `$dateTrunc` expression builder (`bucketOf`) so that every module that needs to aggregate data by day, week, or month in a given IANA zone composes its pipeline the same way.

## Key elements

- **`ReportInterval`** (type) — union of `'day' | 'week' | 'month'`; the three bucket sizes a grouped read may request.
- **`ReportWindow`** (interface) — half-open instant window (`from` inclusive, `to` exclusive) plus `interval` and `timeZone`. Describes *what* a grouped read is asked about.
- **`bucketOf(field, window)`** (const) — returns the `$dateTrunc` aggregation expression for a given date field. Emits `startOfWeek: 'monday'` only when `interval` is `'week'`.

## Relationships

- **`src/modules/stats/services/range.ts`** — constructs `ReportWindow` objects (resolving the user-supplied range into `from`/`to`/`interval`/`timeZone`) that are passed down into the repositories below.
- **`src/modules/invoicing/repository.ts`**, **`src/modules/payments/repository.ts`**, **`src/modules/returns/repository.ts`** — import `bucketOf` and `ReportWindow` to build their respective `$group` pipelines for grouped reads (e.g. invoiced / paid / returned totals per bucket).
- **`src/modules/invoicing/services/stats.ts`**, **`src/modules/payments/services/stats.ts`**, **`src/modules/returns/services/stats.ts`**, **`src/modules/orders/services/stats.ts`** — the service layer that orchestrates a `ReportWindow` through `src/modules/stats/services/range.ts` and then delegates to the owning repository.
- **`tests/unit/infrastructure/persistence/report.test.ts`** — unit tests for `bucketOf` output shape (presence/absence of `startOfWeek`, correct `unit`, `timezone` passthrough).

## Notes

- The window is **half-open** (`from` included, `to` excluded). Callers must not assume inclusive end.
- `startOfWeek` is hard-coded to Monday. If a business requirement ever demands Sunday-starting weeks, this is the single place to change.
- The file is deliberately **not** stats-specific; the doc comment and module name avoid tying it to any one module. Add new grouped-read consumers by importing `bucketOf` rather than re-implementing `$dateTrunc`.
- Money in MongoDB is `Decimal128`, so `$sum` over it is exact — no floating-point rounding is needed at the aggregation layer. Conversion to minor units happens downstream via `toMinorUnits` (`@domain-primitives/money`), not here.
