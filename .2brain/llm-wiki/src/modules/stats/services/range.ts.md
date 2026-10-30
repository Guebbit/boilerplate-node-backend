---
source: src/modules/stats/services/range.ts
sha256: 7b1e55b379dab1ba7538937baeadb3551881c46dfed0e5bb3820917ca2594f3c
generated_at: 2026-10-29T05:56:23.900448+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/range.ts

## Purpose

Resolves a date-range query (`from`/`to` strings) into a concrete `Period` object containing half-open instant windows, a comparison window for the preceding period, and every bucket start. All date-to-instant conversion uses the shop's local timezone so that boundaries and `$dateTrunc` bucket edges always agree.

## Key elements

- **`Period`** (interface) — the resolved output: an `echo` block (the query as the client sent it), a `window` (`ReportWindow`) for the requested period, a `previous` window for the "vs previous" aggregate, and `bucketStarts` (`Date[]`) covering every bucket including empty ones.
- **`resolvePeriod(query)`** (exported function) — validates the range via `checkRange`, fetches the shop timezone, and assembles a `Period`. Returns `{ period }` on success or `{ refusal }` on invalid input. `interval` defaults to `'day'`.
- **`startOf(day, timeZone)`** (internal) — converts a `CalendarDay` to the `Date` instant of that day's midnight in the given zone, delegating to `zonedStartOfDay`.
- **`windowOf(range, interval, timeZone)`** (internal) — builds a `ReportWindow` with `from` = start of first day and `to` = start of the day *after* the last day (half-open, inclusive of both endpoints).

## Relationships

- **`@domain-primitives/time`** — provides `zonedStartOfDay`, the sole date→instant conversion used here.
- **`@infrastructure/persistence/report`** — supplies the `ReportWindow` shape that both `window` and `previous` conform to.
- **`@types`** — supplies the `StatsInterval` union type for bucket sizing.
- **`../domain/calendar`** — provides `addDays` (to compute the exclusive upper bound), `formatDay` (for the `echo` block), and the `CalendarDay` shape.
- **`../domain/range`** — provides `checkRange` (validation + parsed range), `previousOf` (the prior equal-length range), and the `RangeRefusal` type.
- **`@modules/shop`** — provides `shopTimezone()`, the single source of the shop's IANA timezone.

## Notes

- The `previous` window is intentionally coerced to `'month'` granularity regardless of the requested interval, because it is only ever summed — fine-grained buckets add no signal for a comparison total.
- `windowOf` produces a **half-open** interval (`[from, to)`), where `to` is the start of the day *after* the last requested day. Consumers must not treat `to` as inclusive.
- The `echo` block is a pass-through of the original query strings (reformatted via `formatDay`) so the controller can return them verbatim without re-deriving dates.
- The timezone is read once from `shopTimezone()` and threaded through every conversion; there is no per-request override.
