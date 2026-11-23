---
source: src/modules/returns/services/index.ts
source_sha256: 5a262eda9c4c24537335c948f4cbb588f3f33c10763df8542d1620d8b3b194b8
context_sha256: 9f28488f86f66bd3e4b5c1c49118df0ab391aa31c94a568e6f9b2fbbac65cdd9
generated_at: 2026-11-22T07:29:53.996943+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/index.ts

## Purpose
Barrel file for the returns service. It imports one function per operation from sibling files and exposes them together as a single `returnService` object, so controllers depend on one handle instead of many files. Its module doc describes the covered operations as opening a return (the withdrawal button), staff's answer, receiving goods and paying back, visibility of returns, customer mailing, and the account export section.

## Key elements
- **`returnService`**: the exported object aggregating all operations:
  - Lifecycle: `createReturn`, `approveReturn`, `declineReturn`, `receiveReturn`, `recordProofOfSending`, `closeReturnByHand`, `cancelReturn`
  - Reading: `listReturns`, `getReturn`, `getReturnOptions`, `withActions`
  - Notifications: `mailReturnRequested`, `mailReturnDecided`, `mailReturnClosed`
  - Stats: `returnedBuckets`, `returnedByProduct`, `returnedSeries`, `returnsDigest`
  - Data handling: `collectPersonalData`, `scrubReturnText`
- **Re-exported types**: `CreateReturnInput`, `CreateReturnOutcome` (from `./create`), `ReceiveReturnInput` (`./receive`), `ReturnFilters` (`./read`), `ReturnedBucket` (`./stats`).

## Relationships
- Aggregates implementations from sibling files in `services/`: `create`, `decide`, `receive`, `proof`, `close`, `cancel`, `personal-data`, `read`, `options`, `retention`, `notify`, `stats`, `digest`. `create.ts`, `decide.ts`, `close.ts` and `cancel.ts` are among its listed graph neighbors.
- The controllers (`get-return-options`, `get-return`, `get-returns`, `post-return`, `post-return-cancel`, `post-return-close`, `post-return-decision`, `post-return-proof`, `post-return-receive`) are its consumers, as the module doc says controllers call into this service.
- `src/modules/returns/index.ts` and `module.ts` are also graph neighbors of this file.

## Notes
- Each operation lives in its own file; this file contains no logic of its own.
- Only types are re-exported by name. Functions are reachable solely through the `returnService` object.
