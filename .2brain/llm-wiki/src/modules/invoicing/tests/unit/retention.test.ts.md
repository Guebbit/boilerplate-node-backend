---
source: src/modules/invoicing/tests/unit/retention.test.ts
sha256: 489eb29b0c1e1b26b0b6bb7f382c241866695637abd812bc911ff189e0b53edf
generated_at: 2026-10-29T04:19:01.347030+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/retention.test.ts

## Purpose

Unit tests for the buyer document retention clock. Verifies that the retention deadline is computed as local midnight of 1 January in the year (issue year + N + 1) *in the document's timezone*, that the expiry predicate flips exactly at that instant, and that the scan bound always remains before any still-due document.

## Key elements

- **`describe('buyerRetentionEnd')`** — Two cases confirming the end timestamp is 31 Dec 23:00 UTC (i.e. local 1 Jan 00:00 in the document zone) and that the "issue year" is resolved in the document zone, not UTC.
- **`describe('isBuyerRetentionOver')`** — Boundary test (false at 22:59, true at 23:00 local) and a guard against the naive "N × 365 days" shortcut.
- **`describe('buyerRetentionScanBound')`** — An `it.each` table across three extreme timezones asserting the bound never drops a due document, plus a single assertion pinning the bound to `Jan 2 00:00 UTC` of the year (N) before the next calendar year.

## Relationships

- **`src/modules/invoicing/domain/index.ts`** — The single import source (`@modules/invoicing/domain`). Re-exports the three functions under test.
- **`src/modules/invoicing/domain/retention.ts`** — Where `buyerRetentionEnd`, `isBuyerRetentionOver`, and `buyerRetentionScanBound` are implemented. This file is the only consumer exercised by these tests.

## Notes

- The retention clock is **calendar-year based in the document's IANA zone**, not a fixed day offset. Tests deliberately use `Europe/Rome`, `Pacific/Kiritimati`, and `Pacific/Pago_Pago` to pin that contract.
- The `it.each` block in the scan-bound suite guards its assertion with `if (isBuyerRetentionOver(…))`, so rows where the document is *not* yet due skip the inequality check. This means a regression that makes `isBuyerRetentionOver` always return `false` would go uncaught by that table alone.
- "Scan bound" is expressed in **UTC** (e.g. `2016-01-02T00:00:00.000Z`), whereas the retention end is expressed relative to the document zone. Do not assume both share the same timezone representation.
