---
source: src/infrastructure/persistence/report.ts
sha256: fa2e58cd8c33576cd6c28df29432174db0450b063524f25cb2b4da4142ff1d7e
generated_at: 2026-10-14T08:10:54.381305+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/report.ts

## Purpose

Shared MongoDB aggregation helpers for grouped reads (date-bucketed stats). Defines the window shape (`ReportWindow`) and the `$dateTrunc` builder (`bucketOf`) that every stats owner composes into its own pipeline. Lives in `infrastructure/persistence` because it emits MongoDB operator expressions directly; the domain modules consume it without needing to know about `$dateTrunc` details.

## Key elements

- **`ReportInterval`** (type) — `'day' | 'week' | 'month'`. The set of bucket sizes a grouped read can request.
- **`ReportWindow`** (interface) — Describes *what* to read: a half-open `[from, to)` instant window, the desired `interval`, and the IANA `timeZone` in which bucket boundaries are cut (local midnight).
- **`bucketOf(field, window)`** (const, returns object) — Builds the `$dateTrunc` expression for a given date field. Spreads `startOfWeek: 'monday'` **only** when `interval === 'week'`; otherwise the key is omitted from the expression entirely.

## Relationships

- **Repositories** (`invoicing/repository.ts`, `payments/repository.ts`, `returns/repository.ts`) — Compose `bucketOf` into their aggregation pipelines to produce date-bucketed group keys, and pass a `ReportWindow` as the time-bounding parameter.
- **Stats services** (`invoicing/services/stats.ts`, `orders/services/stats.ts`, `payments/services/stats.ts`, `returns/services/stats.ts`) — Construct or normalize a `ReportWindow` before delegating to the owning repository; they do not call `bucketOf` themselves.
- **`src/modules/stats/services/range.ts`** — Sits alongside as the higher-level range/validation concern; `ReportWindow` is the *output* shape that range logic feeds into.
- **`tests/unit/infrastructure/persistence/report.test.ts`** — Unit-tests `bucketOf` output shape (including the conditional `startOfWeek` spread).

## Notes

- The module doc comment references `toMinorUnits` from `@shared-kernel/money` for reading Decimal128 sums, but that function is **not** defined or re-exported here — it is a consumer-side concern.
- `startOfWeek: 'monday'` is deliberately conditional; passing it for `day` or `month` would be invalid to MongoDB. The spread pattern (`...(cond ? {…} : {})`) is the convention to follow if a new conditional key is ever added.
- `from` / `to` are **instants** (absolute `Date` values), not zone-local times. The zone only affects where bucket *boundaries* land, not the window endpoints.
