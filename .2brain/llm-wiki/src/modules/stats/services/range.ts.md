---
source: src/modules/stats/services/range.ts
source_sha256: b857e32568e309cd7d7db5052583f070d682f50b7427b016594de093a494c3a2
context_sha256: acc7b0b31b4f731ca675732084b7421d66940b9463e71f5c249747b6706ce837
generated_at: 2026-11-22T07:52:10.092955+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/services/range.ts

## Purpose
Turns a requested stats period (`from`/`to` calendar days plus an optional bucket interval) into what the persistence layer needs: shop-local midnights as instants, the equal-length previous window, and every bucket start (so empty buckets can be filled). It uses the shop's timezone (`NODE_SHOP_TIMEZONE`), the same zone `$dateTrunc` buckets in, so bucket edges and window bounds always agree about a day.

## Key elements
- `resolvePeriod(query)` — validates the request via `checkRange` and resolves it against the shop's zone. Returns `{ period }` or `{ refusal }`. The interval defaults to `'day'`.
- `Period` — the resolved shape:
  - `echo`: the requested `from`/`to`/`interval`/`timeZone`, as the contract echoes them.
  - `window`: the half-open instant window of the period.
  - `previous`: the equal-length window just before it.
  - `bucketStarts`: the instant each bucket starts at, empty ones included.
- `WithoutLimits<T>` — `Omit<T, 'limits'>`, the type of a composer's answer before the shared handler adds `limits`.
- `startOf` / `windowOf` (internal) — convert a `CalendarDay` to its shop-local start instant. `windowOf` builds the half-open window from the first day through the day after the last, so both days are inclusive.

## Relationships
- Uses `zonedStartOfDay` from `src/domain-primitives/time.ts` for the day-to-instant conversion.
- Uses `checkRange`, `previousOf` and `RangeRefusal` from `src/modules/stats/domain/range.ts`, and `addDays`, `formatDay` and `CalendarDay` from `src/modules/stats/domain/calendar.ts`.
- Gets the zone from `shopTimezone()` in `src/modules/shop/index.ts`.
- Produces `ReportWindow` values, the type defined in `src/infrastructure/persistence/report.ts`. `StatsInterval` comes from `src/types/index.ts`.
- `WithoutLimits` is meant for composers such as `src/modules/stats/services/sales.ts` and `src/modules/stats/services/breakdowns.ts`, and `src/modules/stats/controllers/respond.ts` adds `limits` to every period answer.

## Notes
- The `previous` window always uses a `'month'` interval. The comment says it is only summed, so one coarse bucket per month is enough.
- The window end is the start of the day after `to`, so the window is half-open.
