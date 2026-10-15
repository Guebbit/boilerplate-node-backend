---
source: src/modules/stats/services/range.ts
sha256: cb04b32c39d799fe29f6ee7618919f7a4c94fd3e4d1123d7ea74b8ab05a341a5
generated_at: 2026-10-15T12:04:27.688720+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/range.ts

## Purpose

Resolves an API query (`from`, `to`, optional `interval`) into a fully materialized `Period` object: the shop-local half-open instant window, a previous-period window, and every bucket-start instant (including empty buckets). Centralising this conversion here ensures the `$dateTrunc` bucketing zone and the query bounds always agree on what "a day" means.

## Key elements

- **`Period` (interface)** — The resolved shape consumed by downstream stats queries. Contains `echo` (the original request echoed back for the API response), `window` (current half-open instants + interval + zone), `previous` (prior equal-length window), and `bucketStarts` (every bucket start as a `Date`, gaps included).
- **`resolvePeriod(query)`** — Validates the request via `checkRange`, resolves the shop timezone via `shopTimezone()`, builds the current and previous windows, and maps `bucketStarts` to instants. Returns either `{ period }` or `{ refusal }` (a `RangeRefusal`).
- **`startOf` (private)** — Converts a `CalendarDay` + timezone string into the instant that local day begins, delegating to `zonedStartOfDay`.
- **`windowOf` (private)** — Builds a `ReportWindow` from an inclusive day range: `from` = start of first day, `to` = start of the day *after* the last day (half-open).

## Relationships

- **`@modules/orders` (`zonedStartOfDay`)** — Reuses the orders module's tz-aware "start of day" logic so stats and order queries share one definition of a local midnight.
- **`@infrastructure/persistence/report` (`ReportWindow`)** — The resolved windows are the exact shape the persistence layer expects for MongoDB range queries.
- **`../domain/range` (`checkRange`, `previousOf`)** — Pure-calendar validation (date parsing, range sanity, interval enforcement) and previous-period calculation; this file adds the timezone/instant layer on top.
- **`../domain/calendar` (`addDays`, `formatDay`, `CalendarDay`, `CalendarInterval`)** — Calendar arithmetic and the shared day/interval types.
- **`@modules/shop` (`shopTimezone`)** — Source of truth for which IANA zone the shop operates in (`NODE_SHOP_TIMEZONE`).
- **`../services/sales.ts` / `../services/breakdowns.ts`** — Downstream consumers that receive a `Period` and build the actual aggregation pipelines.
- **`../controllers/respond.ts`** — Serialises the `Period.echo` field into the API response so clients get their original parameters back.
- **`../tests/integration/stats.test.ts`** — Exercises `resolvePeriod` end-to-end with the orders/report stack.

## Notes

- The `previous` window is **always** resolved with `'month'` interval regardless of the requested `interval`, because it is only ever summed (not bucketed per-day). This keeps the "vs previous" comparison cheap without changing its result.
- `bucketStarts` includes every day in the range as a `Date` instant. Downstream services use this list to zero-fill missing buckets so the returned series is contiguous.
- The `echo.timeZone` is the *resolved* zone, not necessarily a client-supplied value; callers should not treat it as user input.
- The function returns a discriminated union (`{ period }` | `{ refusal }`), so callers must check before accessing `.period`.
