---
source: src/modules/invoicing/tests/unit/retention.test.ts
sha256: c2b265e72802690df716917a9f940be172f0d5778273dbbf17a6d0fcde0a8091
generated_at: 2026-11-14T20:17:01.796852+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/retention.test.ts

## Purpose

Unit tests for the buyer-retention "tax clock" rule: a document is due on local midnight of 1 January of (issue year + N + 1), computed in the document's own timezone, and the scan bound must never exclude a document that is already due. The tests pin down timezone-sensitive edge cases that are easy to get wrong with UTC-naive arithmetic.

## Key elements

- **`describe('buyerRetentionEnd')`** — Verifies the computed end-date is local midnight of 1 Jan, N+1 years after the issue *year* (not the issue date), and that the issue year is determined in the document's zone (e.g. 23:30 UTC on 31 Dec in Rome counts as the next year).
- **`describe('isBuyerRetentionOver')`** — Confirms the boolean flips exactly at local New Year (one minute before → `false`, at the boundary → `true`) and that a naive "N × 365 days" heuristic does *not* coincide with the actual due date.
- **`describe('buyerRetentionScanBound')`** — Table-driven test across extreme offsets (UTC+14 Kiritimati, UTC−11 Pago Pago, UTC+1 Rome) asserting the invariant: if a document is already due, `document.issuedAt < scanBound` must hold. A second case checks the bound equals Jan 2 of year N before "tomorrow" in UTC (i.e. start of year N before the current year).

## Relationships

- **`src/modules/invoicing/domain/retention.ts`** — Source of the three pure functions under test (`buyerRetentionEnd`, `isBuyerRetentionOver`, `buyerRetentionScanBound`).
- **`src/modules/invoicing/domain/index.ts`** — Barrel module that re-exports those functions; the test imports them via the `@modules/invoicing/domain` path.

## Notes

- Tests are timezone-aware by design; the critical invariant is "the scan bound never excludes a due document," not a specific numeric result. When adjusting retention logic, verify the Kiritimati (UTC+14) and Pago Pago (UTC−11) rows still pass—they exercise the earliest and latest possible local New Year within a UTC day.
- The "N+1" offset is intentional (not a typo): the retention period is N full calendar years *after* the issue year, so the deadline lands on the 1 January following the Nth anniversary year.
