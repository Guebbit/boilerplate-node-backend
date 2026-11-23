---
source: src/modules/invoicing/tests/unit/retention.test.ts
source_sha256: cbe7b6326d0a971e7c43cb06c1b34f0d20731720b4f66330363d78e0072d91c3
context_sha256: a3964429bfc3c94217cca812eb3907046343e0ee5fdb55336e25ea9134730d1e
generated_at: 2026-11-22T05:40:55.007538+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/retention.test.ts

## Purpose
Unit tests for the buyer-document retention ("tax clock") rule. They pin down that a document becomes due on 1 January of (issue year + N + 1) in the zone it was issued in, and that the scan bound used to find candidates never excludes a document that is actually due.

## Key elements
- `describe('buyerRetentionEnd')`
  - For an issue date of 2015-06-01 in `Europe/Rome` with N=10, the end is local midnight of 1 Jan 2026, which is `2025-12-31T23:00:00.000Z`.
  - The issue year is counted in the document's zone, not UTC. 2015-12-31T23:30Z is already 1 Jan 2016 in Rome, so the end is `2026-12-31T23:00:00.000Z`.
- `describe('isBuyerRetentionOver')`
  - Uses a fixed document `{ issuedAt, timezone }`.
  - It is false at 22:59Z and true at 23:00Z on 2025-12-31, which is the Rome New Year boundary.
  - It is false exactly N * 365 days after issue, so the rule is calendar-based and not a day count.
- `describe('buyerRetentionScanBound')`
  - A parameterised `it.each` runs three cases: `Pacific/Kiritimati` (UTC+14), `Pacific/Pago_Pago`, and `Europe/Rome`. Each case checks two things at the "due" instant:
    - `isBuyerRetentionOver` is true.
    - `issuedAt < buyerRetentionScanBound(10, at)`, so the bound lies after the document.
  - A second test checks that for `now` = 2026-05-05T12:00Z the bound is `2016-01-02T00:00:00.000Z`. That is the start of the year N before tomorrow, in UTC.

## Relationships
- Imports `buyerRetentionEnd`, `buyerRetentionScanBound` and `isBuyerRetentionOver` from `@modules/invoicing/domain`, the barrel `src/modules/invoicing/domain/index.ts`.
- Those functions are the pure retention rule in `src/modules/invoicing/domain/retention.ts`, which this file exercises. The test never imports that file directly.

## Notes
- The tests take every instant as an argument (`now`/`at`). They need no fake timers, and no clock is read.
- The scan-bound cases cover the extreme zones, UTC+14 and a negative-offset zone, which is where a naive UTC bound would wrongly drop a due document.
- Expected values are hard-coded UTC instants, so the Rome cases assume standard time (UTC+1) on 1 January.
