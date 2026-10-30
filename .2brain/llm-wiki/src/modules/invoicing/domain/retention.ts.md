---
source: src/modules/invoicing/domain/retention.ts
sha256: 8dc1f809d26a4c43f960b7a74264e01b8dd66afcfb56cc267d1633008baddd7b
generated_at: 2026-10-29T04:11:12.753772+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/retention.ts

## Purpose

Pure rule functions that determine when an invoice's buyer block becomes due for deletion under tax record-keeping obligations (IT art. 2220 c.c., DE, FR). The "tax clock" runs to the end of the issue year plus N full years, so the deadline is local midnight of 1 January of (issue year + N + 1). This file isolates that calculation from any I/O so it can be reused and tested in isolation.

## Key elements

- **`buyerRetentionEnd(issuedAt, timezone, years)`** — Returns the exact `Date` (local midnight of Jan 1) at which the buyer block is due. Derives the issue year from the document's frozen IANA zone, not UTC.
- **`isBuyerRetentionOver(document, years, now)`** — Boolean check: is `now` at or past `buyerRetentionEnd` for the given document's frozen `issuedAt`/`timezone` pair.
- **`buyerRetentionScanBound(years, now)`** — A deliberately loose UTC upper-bound on `issuedAt` for a cheap index scan. Guarantees no due document sits at or after the bound, without needing the document's zone. Intended to be applied *before* the exact rule runs.

## Relationships

- **`src/domain-primitives/time.ts`** — Supplies `DAY_MS`, `dayInZone`, and `zonedStartOfDay`, the only time utilities this file imports.
- **`src/modules/invoicing/domain/index.ts`** — Re-exports the three functions as the public domain surface for the invoicing module.
- **`src/modules/invoicing/services/retention.ts`** — Service layer that calls these pure rules alongside I/O (reading documents, persisting results).
- **`src/modules/invoicing/tests/unit/retention.test.ts`** — Unit tests covering edge cases (zone boundaries, leap years, scan-bound inclusivity).

## Notes

- **Do not substitute `issuedAt + N * 365 days`.** The rule is calendar-year based, not duration-based; a naive duration check can fire up to a year early.
- The issue year is extracted via `dayInZone(issuedAt, timezone)`, meaning the *document's frozen zone* decides the year — not the server's local zone, not UTC.
- `buyerRetentionScanBound` is intentionally an over-approximation (uses UTC year of *tomorrow* and Feb 1 UTC) so the index scan never misses a due document. It is safe to over-select; the exact rule filters the remainder.
- All three exports are pure functions (no I/O, no mutation), making them trivially testable and safe to call from any context.
