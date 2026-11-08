---
source: src/modules/stats/services/range.ts
sha256: b857e32568e309cd7d7db5052583f070d682f50b7427b016594de093a494c3a2
generated_at: 2026-11-08T08:25:54.348176+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/range.ts

## Purpose

Resolves a raw `from`/`to`/`interval` query into a fully-typed `Period` — half-open instant windows and a list of bucket-start Dates — all anchored to the shop's local timezone. It exists so every stats composer works from the same, validated, zone-consistent time boundaries rather than re-deriving them.

## Key elements

- **`WithoutLimits<T>`** – Type alias (`Omit<T, 'limits'>`). Signals that a composer's return type deliberately excludes `limits`, which the shared response handler adds later.
- **`Period`** – Interface carrying `echo` (the original request echoed back), `window` (half-open `ReportWindow`), `previous` (equal-length window before it), and `bucketStarts` (every bucket boundary as a `Date`).
- **`startOf`** (private) – Converts a `CalendarDay` to the `Date` of shop-local midnight using `zonedStartOfDay`.
- **`windowOf`** (private) – Builds a `ReportWindow` from an inclusive day range: `from` is midnight of the first day, `to` is midnight of the day *after* the last (half-open).
- **`resolvePeriod`** (export) – Validates the query via `checkRange`, fetches the shop timezone, and returns either `{ period }` or `{ refusal }`. This is the single entry point composers call.

## Relationships

- **`@domain-primitives/time`** – `zonedStartOfDay` is the only conversion from calendar dates to instants.
- **`../domain/range`** – `checkRange` validates bounds/interval; `previousOf` computes the preceding range. `RangeRefusal` is the failure shape.
- **`../domain/calendar`** – `addDays`, `formatDay`, and the `CalendarDay` type underpin all date arithmetic and the `echo` strings.
- **`@modules/shop`** – `shopTimezone()` supplies the zone; this file never accepts a caller-supplied timezone.
- **`@infrastructure/persistence/report`** – `ReportWindow` is the shape both `window` and `previous` must conform to for the query layer.
- **`controllers/respond.ts`** – The shared handler that attaches `limits` to every period answer, which is why `WithoutLimits` exists.
- **`services/sales.ts`, `services/breakdowns.ts`** – Consumers that call `resolvePeriod` and iterate `bucketStarts` / `window`.
- **`services/index.ts`** – Barrel re-export for other modules.
- **`tests/integration/stats.test.ts`** – Exercises the full resolve → query path.

## Notes

- The `previous` window is always resolved at `'month'` granularity regardless of the requested `interval`, because it is only ever summed, not bucketed.
- `window.to` is exclusive (start of the day after the last requested day), matching `$dateTrunc` bucket edges — a bucket boundary and a range bound can never disagree about a day boundary.
- `resolvePeriod` defaults `interval` to `'day'` when the caller omits it; the `echo` field reflects the *resolved* interval, not necessarily what was sent.
