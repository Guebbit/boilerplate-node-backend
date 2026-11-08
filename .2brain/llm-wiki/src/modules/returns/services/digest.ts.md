---
source: src/modules/returns/services/digest.ts
sha256: 74a275eef5bc695a16a9409bc773d795689b5dacf869370cfe7cd660faf597ff
generated_at: 2026-11-08T08:03:47.526295+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/digest.ts

## Purpose

Computes the two return-side counts that the daily staff digest displays: how many return requests are still undecided past a configurable grace period, and how many approved withdrawals are still awaiting receipt of goods. It is a read-only aggregation service; it never mutates state.

## Key elements

- **`ReturnsDigest`** (interface) — The shape of the digest result: `{ undecided: number; withdrawalsAwaitingGoods: number }`.
- **`returnsDigest(now, decisionDays)`** (const arrow function) — The sole entry point. Takes a reference instant and a day threshold, fires two `returnRepository.count` queries in parallel via `Promise.all`, and returns a `ReturnsDigest`.

## Relationships

- **`src/types/index.ts`** — Imports `ReturnKind`, `ReturnReason`, and `ReturnStatus` to build the two count filter objects.
- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` to convert `decisionDays` into a millisecond offset for the `createdAt` cutoff.
- **`src/modules/returns/repository.ts`** — Imports `returnRepository`; all data access goes through its `.count(query)` method.
- **`src/modules/returns/services/index.ts`** — Barrel file that re-exports `returnsDigest` and `ReturnsDigest` so callers can import from the services index rather than this path directly.

## Notes

- The "undecided" count is relative: it only includes `requested` returns created **at least** `decisionDays` before `now`. A request younger than the threshold is excluded.
- The "withdrawals awaiting goods" count is a static filter (status + kind + reason) with no time component—every approved withdrawal remains in the count until its status changes.
- Both queries run concurrently; the function resolves as soon as the slower count finishes.
