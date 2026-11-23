---
source: src/modules/returns/services/retention.ts
source_sha256: e360f805a5c41f66a43d617ffaf1460ac03abb4c961a1b8a20e133842d752517
context_sha256: b1f96a7dd9a9042802e57d383ac688ce21889f07180b0edc2f88b9184cbf5d6b
generated_at: 2026-11-22T07:32:24.403328+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/retention.ts

## Purpose
Implements the free-text retention policy for returns. A return row is a legal record and is kept, but the free text a person typed (or staff wrote about them) is wiped once the return has been inactive long enough.

## Key elements
- `scrubReturnText(): Promise<number>`: the sweep run by `reap:returns`.
  - Computes a cutoff of `Date.now() - returnTextRetentionDays() * DAY_MS`.
  - Calls `returnRepository.scrubFreeTextBefore(cutoff)`. Per the doc comment, this unsets `note` and `declineMessage` on every return whose `updatedAt` is older than the cutoff.
  - Logs an info message (`'Wiped free text on returns past retention.'`) with the `scrubbed` count, only when that count is greater than 0.
  - Resolves to the number of returns that lost their text.

## Relationships
- `src/modules/returns/repository.ts`: provides the `returnRepository` object whose `scrubFreeTextBefore` method does the actual update.
- `src/modules/returns/config.ts`: `returnTextRetentionDays()` supplies the retention window. The doc comment names the env var as `NODE_RETURN_TEXT_RETENTION_DAYS`.
- `src/domain-primitives/time.ts`: `DAY_MS` converts days to milliseconds.
- `src/infrastructure/adapters/logger.ts`: provides the `logger` used for the info log.
- `src/modules/returns/jobs.ts`: the doc comment says this function is the `reap:returns` sweep, so this is the job-side neighbor.
- `src/modules/returns/services/index.ts` and `src/modules/returns/tests/integration/retention.test.ts`: neighbors in the dependency graph. The file's content does not show how they interact with it.

## Notes
- The cutoff is based on `updatedAt`, not the closing date. An approved return whose goods never arrive stays quiet for as long as staff leave it, and its text is wiped like any other.
- The reason code is not free text, so it is not wiped. Only `note` and `declineMessage` are.
- The logging call is marked `// Stryker disable next-line all`, so it is excluded from mutation testing.
