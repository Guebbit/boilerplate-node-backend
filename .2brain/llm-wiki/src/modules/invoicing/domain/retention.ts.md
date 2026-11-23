---
source: src/modules/invoicing/domain/retention.ts
source_sha256: 1b5e3bd9f5f5052cbfb300d6e2097c996b7a6bdcbab0b55c3f829022b065ddd0
context_sha256: 76d49e22a9be4c64b09b8b04531a581eeb46be0046e8d4723f1bd5434d707024
generated_at: 2026-11-22T05:31:00.034237+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/domain/retention.ts

## Purpose
Pure rule for when an invoice's buyer block stops being needed under tax record-keeping periods. A document is due on 1 January (local midnight, in the zone it was issued in) of issue year + N + 1, rather than `issuedAt + N * 365 days`, which could run up to a year early. The comments cite IT art. 2220 c.c., DE and FR.

## Key elements
- `buyerRetentionEnd(issuedAt, timezone, years)`: returns the `Date` at which the buyer block is due to go. It takes the issue year in the document's zone via `yearInZone` and returns `zonedStartOfDay(issueYear + years + 1, 1, 1, timezone)`.
- `isBuyerRetentionOver(document, years, now)`: returns a boolean that is set when `now >= buyerRetentionEnd(...)`. `document` supplies only `issuedAt` and `timezone`.
- `buyerRetentionScanBound(years, now)`: returns an `issuedAt` upper bound, for a cheap index scan before the exact rule runs. It is `Date.UTC(<UTC year of now + 1 day> - years, 0, 2)`. No due document can have an `issuedAt` at or after this bound.

## Relationships
- Imports `DAY_MS`, `yearInZone` and `zonedStartOfDay` from `@domain-primitives/time` (`src/domain-primitives/time.ts`). All zone and calendar handling is delegated there.
- Is the rule that `src/modules/invoicing/services/retention.ts` is related to in the graph. The file itself imports nothing from the services layer.
- Is exercised by `src/modules/invoicing/tests/unit/retention.test.ts`.
- Is a sibling of `src/modules/invoicing/domain/index.ts`, which sits in the same domain folder.

## Notes
- The scan bound is deliberately conservative. The comment gives the reasoning: the zone year is at most the UTC year of tomorrow, and a local 1 January falls before 2 January UTC. It is a coarse prefilter, so use `isBuyerRetentionOver` or `buyerRetentionEnd` for the exact decision.
- `timezone` is the IANA zone frozen on the document, so its calendar decides the issue year, not the shop's current zone.
- All functions are pure. `now` is passed in, so none of them read the clock.
