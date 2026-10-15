---
source: src/modules/returns/services/index.ts
sha256: b035c0859b0a0355f6e20f6e728f49009a1c0afbd23b0e289f6eafe005c5ec1a
generated_at: 2026-10-15T11:56:38.797161+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/index.ts

## Purpose

Barrel (index) file for the returns services layer. It re-exports every public function and type from the individual service files (`create`, `decide`, `receive`, `read`, `options`, `retention`, `stats`, `close`, `cancel-remainder`, `personal-data`) and also bundles a subset of them into a single `returnService` object, giving callers one stable import surface instead of reaching into each leaf file.

## Key elements

- **Named re-exports** — `createReturn`, `approveReturn`, `declineReturn`, `receiveReturn`, `listReturns`, `getReturn`, `withActions`, `getReturnOptions`, `collectPersonalData`, `scrubReturnText`, `closeReturn`, `cancelUnanswered`, and the type `CreateReturnInput`, `CreateReturnOutcome`, `ReceiveReturnInput`, `ReturnFilters`, `ReturnedBucket`.
- **`returnService`** — a const object exposing `createReturn`, `approveReturn`, `declineReturn`, `receiveReturn`, `listReturns`, `getReturn`, `getReturnOptions`, `withActions`, `scrubReturnText`, `returnedBuckets`, `returnedByProduct`, `returnedSeries` as a single namespace handle.

## Relationships

- **Controllers** (`post-return.ts`, `get-returns.ts`, `get-return-by-id.ts`, `get-return-options.ts`, `post-return-decision.ts`, `post-return-receive.ts`) import individual service functions (or the `returnService` object) through this file to perform their operations.
- **`src/modules/returns/index.ts`** re-exports this file, making it the public API surface for the returns module.
- **`scripts/ops/reap-returns.ts`** imports from this file for operational/batch use (e.g. `cancelUnanswered`).
- **Leaf service files** (`create.ts`, `decide.ts`, `receive.ts`, `read.ts`, `options.ts`, `close.ts`, `cancel-remainder.ts`, `personal-data.ts`, `retention.ts`, `stats.ts`) are the sources this barrel re-exports from.

## Notes

- `closeReturn`, `cancelUnanswered`, and `collectPersonalData` are re-exported but are **not** members of the `returnService` object — they are only available via the individual named exports.
- `returnedBuckets`, `returnedByProduct`, and `returnedSeries` are included in `returnService` but have no corresponding `import` statement in this file; they are re-exported directly from `./stats`.
- The `import` block at the top does not cover every re-export (e.g. `close`, `cancel-remainder`, `personal-data`), which is valid because re-exports can reference modules without a prior import.
