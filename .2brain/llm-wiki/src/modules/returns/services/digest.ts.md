---
source: src/modules/returns/services/digest.ts
sha256: a937e1d85da7fe6150a2f48cfcbd5886a478e3c62a1bba283b1f68fc488f558b
generated_at: 2026-10-29T05:42:46.023609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/digest.ts

## Purpose

Computes the two returns-side counts that feed the daily staff digest: how many return requests have been waiting for a decision beyond the allowed number of days, and how many approved withdrawal returns are still awaiting receipt of goods. It produces counts only—no record data is returned.

## Key elements

- **`ReturnsDigest`** (interface) — the shape of the result: `{ undecided: number; withdrawalsAwaitingGoods: number }`.
- **`returnsDigest(now, decisionDays)`** (const, async) — issues two `returnRepository.count` queries in parallel (`Promise.all`) and returns a `ReturnsDigest`. The first query matches `status: requested` with `createdAt` older than `now - decisionDays * DAY_MS`; the second matches `status: approved`, `kind: return`, `reason: withdrawal`.

## Relationships

- **`src/modules/returns/repository.ts`** — sole data source; `returnRepository.count` is called twice (once per digest metric).
- **`src/domain-primitives/time.ts`** — provides the `DAY_MS` constant used to convert `decisionDays` into a millisecond offset.
- **`src/types/index.ts`** — provides the enum values `ReturnStatus`, `ReturnKind`, `ReturnReason` used in the query predicates.
- **`src/modules/returns/services/index.ts`** — barrel file for the services directory; expected to re-export this module so callers can import `returnsDigest` from the package root.

## Notes

- The "awaiting goods" metric is a static count of all approved withdrawal returns, not filtered by elapsed time. Only the `undecided` metric is time-gated.
- Both queries are independent; a failure in either rejects the entire Promise. There is no partial-failure handling.
- The file is intentionally side-effect-free: it never writes, only reads via `count`.
