---
source: src/modules/returns/services/digest.ts
sha256: 874b1d864f99e21647c5b2d8aa604dad66dfdbb0610b703f36d3380d3b0fdd1a
generated_at: 2026-11-14T21:38:53.202336+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/digest.ts

## Purpose

Produces the two headline counts the daily staff digest needs from the returns module: how many requests are still undecided past their allowed waiting period, and how many approved returns are overdue for the buyer's goods. It returns bare numbers, not records.

## Key elements

- **`ReturnsDigest`** (interface) — the result shape: `undecided: number` and `returnsAwaitingGoods: number`.
- **`ReturnsDigestAllowances`** (interface) — caller-supplied thresholds: `decisionDays` (how long a request may sit) and `sendBackOverdueDays` (how long an approved return may wait for goods/proof).
- **`returnsDigest(now, allowances)`** (function) — the sole logic export. Runs two `count` queries in parallel via `Promise.all` and maps the results into a `ReturnsDigest`.

## Relationships

- **`src/types/index.ts`** — imports `ReturnStatus`, `ReturnKind`, and `ReturnReason` enums used to build the query filters.
- **`src/domain-primitives/time.ts`** — imports the `DAY_MS` constant to convert the day-based allowances into millisecond offsets.
- **`src/modules/returns/repository.ts`** — imports `returnRepository` from this file and calls its `count` method twice (once for undecided, once for overdue-goods).
- **`src/modules/returns/services/index.ts`** — barrel re-exports `returnsDigest`, `ReturnsDigest`, and `ReturnsDigestAllowances` for downstream importers.

## Notes

- The "overdue" timestamp differs by reason: for **withdrawal** the clock starts at `requestedAt` (the buyer's initial action), but for **defective** / **wrong_item** it starts at `decidedAt` (the staff approval moment). Both are compared against the same `overdueBefore` cutoff, so the two `$or` branches are not interchangeable.
- The second count requires `kind: ReturnKind.return` and `proofOfSendingAt: { $exists: false }`, meaning a return that already has proof-of-sending is excluded regardless of age.
- The function is async purely to match the repository's promise-based API; there is no internal branching or I/O beyond the two `count` calls.
