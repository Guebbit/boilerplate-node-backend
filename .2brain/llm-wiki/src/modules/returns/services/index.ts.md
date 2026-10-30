---
source: src/modules/returns/services/index.ts
sha256: 158836318f0bca4f085e396f8590789969bf68b3dafd408efcb6afbbc7ec20fa
generated_at: 2026-10-29T05:43:00.278692+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/index.ts

## Purpose

Barrel module that re-exports every returns-domain function into a single `returnService` handle. Controllers and the module container interact with one object instead of scattering imports across a dozen sub-files.

## Key elements

- **`returnService`** (const object) — the sole named export of this file. Aggregates 19 functions covering the full return lifecycle:
  - *Write path:* `createReturn`, `approveReturn`, `declineReturn`, `receiveReturn`, `closeReturnByHand`, `cancelReturn`
  - *Read / query:* `listReturns`, `getReturn`, `withActions`, `getReturnOptions`
  - *Retention / privacy:* `scrubReturnText`, `collectPersonalData`
  - *Notification:* `mailReturnRequested`, `mailReturnDecided`, `mailReturnClosed`
  - *Reporting:* `returnedBuckets`, `returnedByProduct`, `returnedSeries`, `returnsDigest`
- **Type re-exports** — `CreateReturnInput`, `CreateReturnOutcome`, `ReceiveReturnInput`, `ReturnFilters`, `ReturnedBucket` (convenience for callers that need types without importing the sub-file directly).

## Relationships

- **Downstream (this file →):** imports individual functions from `./create`, `./decide`, `./close`, `./cancel` (and other sibling service files). These are the leaf implementations; this file only re-exports them.
- **Upstream (→ this file):** the returns controllers (`post-return.ts`, `post-return-decision.ts`, `post-return-receive.ts`, `post-return-cancel.ts`, `post-return-close.ts`, `get-returns.ts`, `get-return-by-id.ts`, `get-return-options.ts`) and the module wiring (`module.ts`, `returns/index.ts`) consume `returnService` from this module to call the appropriate lifecycle step.

## Notes

- The object is intentionally flat (no nesting). Call sites do `returnService.approveReturn(...)`, not `returnService.decide.approveReturn(...)`.
- `withActions` is a read-path helper that layers permitted actions onto a return record; it is not a CRUD verb despite living among them.
- `scrubReturnText` (retention) and `collectPersonalData` are grouped with the lifecycle functions even though they are governance operations, not state transitions.
