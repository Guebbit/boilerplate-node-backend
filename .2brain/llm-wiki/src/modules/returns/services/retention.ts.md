---
source: src/modules/returns/services/retention.ts
sha256: a13520a26e12c5b5bade76ae07c488bf3f119e542a9ba85f2b7a9a3e6938947b
generated_at: 2026-10-15T11:58:38.849457+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/retention.ts

## Purpose

Implements the free-text retention sweep for returns: after a return has been quiet past a configurable number of days, its user- or staff-authored text fields (`note`, `declineReason`) are wiped. The return row itself (the legal record) is never deleted—only the free text is removed.

## Key elements

- **`scrubReturnText()`** (exported) — Queries the repository for returns whose `updatedAt` is older than the retention window, clears their free-text fields, and returns the count of affected rows. Logs an `info` message only when the count is greater than zero.

## Relationships

- **`src/modules/returns/repository.ts`** — Calls `returnRepository.scrubFreeTextBefore(cutoffDate)` to perform the actual database update.
- **`src/modules/returns/config.ts`** — Reads `returnTextRetentionDays()` to determine the cutoff (sourced from `NODE_RETURN_TEXT_RETENTION_DAYS`).
- **`src/infrastructure/adapters/logger.ts`** — Emits an info log when rows are scrubbed.
- **`src/modules/returns/services/index.ts`** — Re-exports `scrubReturnText` as part of the public services barrel.
- **`src/modules/returns/tests/integration/retention.test.ts`** — Integration tests covering the scrub behavior.
- **`scripts/ops/reap-returns.ts`** (referenced in the module doc comment) — The ops script that invokes `scrubReturnText` as a scheduled sweep.

## Notes

- The retention clock is anchored to `updatedAt`, **not** a "closed" date. An approved return whose goods never arrive never formally closes, so `updatedAt` is the practical last-activity marker.
- The retention threshold is environment-driven (`NODE_RETURN_TEXT_RETENTION_DAYS`); changing it does not require a code change.
- Stryker mutation coverage is explicitly disabled on the `logger.info` line (test-only concern).
