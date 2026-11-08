---
source: src/modules/invoicing/tests/unit/retention.test.ts
sha256: 489eb29b0c1e1b26b0b6bb7f382c241866695637abd812bc911ff189e0b53edf
generated_at: 2026-11-08T06:19:27.806124+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/retention.test.ts

## Purpose

Unit tests for the buyer document-retention rule: given an issue date, a timezone, and a retention period *N*, the functions compute a local-midnight deadline (1 Jan of issue-year + N + 1), check whether that deadline has passed, and produce a UTC scan bound that never excludes a document whose retention has expired.

## Key elements

- **`describe('buyerRetentionEnd')`** – Verifies that the computed end date is local midnight on 1 January of (issue year + N + 1) and that "issue year" is resolved in the document's IANA timezone, not UTC.
- **`describe('isBuyerRetentionOver')`** – Confirms the boolean flips exactly at local midnight of the deadline and that a naïve N × 365-day offset does *not* trigger the check.
- **`describe('buyerRetentionScanBound')`** – Uses `it.each` across three timezones (Kiritimati, Pago Pago, Rome) to assert the bound never sits at or before a due document's issue timestamp. A second case pins the bound to a specific UTC instant (Jan 2 00:00 UTC of the year N before the current date).

## Relationships

- **`src/modules/invoicing/domain/index.ts`** – Barrel import target; the test pulls `buyerRetentionEnd`, `buyerRetentionScanBound`, and `isBuyerRetentionOver` through this module's public re-exports.
- **`src/modules/invoicing/domain/retention.ts`** – The implementation file behind those re-exports; this test exercises only its three exported functions.

## Notes

- Timezone sensitivity is the central concern: two tests in the `buyerRetentionEnd` block use dates that straddle a New Year boundary in the document zone but not in UTC, guarding against a UTC-only year calculation.
- The scan-bound "never drops" test is conditional (`if (isBuyerRetentionOver(...))`), meaning it only asserts the inequality when the document is actually due; it does not constrain the bound for non-due documents.
- The `buyerRetentionScanBound` "start of the year" test expects **Jan 2 00:00 UTC**, not Jan 1—off-by-one from a literal "start of year" reading. Treat the assertion as the spec.
