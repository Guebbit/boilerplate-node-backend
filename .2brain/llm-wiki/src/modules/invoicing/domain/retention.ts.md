---
source: src/modules/invoicing/domain/retention.ts
sha256: 9641f816bad1286340077288306c6aaa672d08b268f4e04c4fdf652cd1443e8e
generated_at: 2026-11-08T06:10:36.714959+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/retention.ts

## Purpose

Pure, side-effect-free rules that compute when an invoice's buyer block (tax record) must be deleted. Encapsulates the jurisdictional tax-clock (IT art. 2220 c.c., DE, FR): retention runs through the **end** of the issue year plus N full years, so the due instant is local midnight of 1 January in year `issueYear + N + 1`, in the document's frozen timezone.

## Key elements

- **`buyerRetentionEnd(issuedAt, timezone, years) → Date`** — Returns the exact due instant: `zonedStartOfDay(issueYear + years + 1, 1, 1, timezone)`.
- **`isBuyerRetentionOver(document, years, now) → boolean`** — Convenience predicate; delegates to `buyerRetentionEnd` and compares with `now`.
- **`buyerRetentionScanBound(years, now) → Date`** — A *conservative* upper bound on `issuedAt` for a cheap DB index scan. Documents at or after this bound **cannot** be due yet; documents before it **may** be due and need the exact rule. Computed as UTC 2 Jan of `tomorrowYear - years`.

## Relationships

- **`src/domain-primitives/time.ts`** — Provides `DAY_MS`, `yearInZone`, and `zonedStartOfDay`, the only external dependencies of this file.
- **`src/modules/invoicing/domain/index.ts`** — Barrel file that re-exports this module's symbols for the rest of the invoicing domain.
- **`src/modules/invoicing/services/retention.ts`** — Service-layer consumer that calls these pure functions inside orchestration (DB access, job scheduling).
- **`src/modules/invoicing/tests/unit/retention.test.ts`** — Unit tests covering the three exports.

## Notes

- The +1 offset (`years + 1`) is intentional and easy to get wrong: it accounts for the partial issue year. A naive `issuedAt + N * 365d` can expire up to a year early.
- `buyerRetentionScanBound` is deliberately **looser** than the exact rule (it uses tomorrow's UTC year as an upper bound on the zone year). It exists only to shrink the candidate set before `isBuyerRetentionOver` runs; do not use it as a substitute for the exact check.
- All three functions are pure and accept a `now`/`issuedAt` explicitly—no hidden clock reads—so they are trivially testable.
- The timezone string is frozen on the document at issuance; it is the authority for "which year was it issued in," not UTC.
