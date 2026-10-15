---
source: src/modules/account/tests/unit/epoch.test.ts
sha256: 51b5e901f0627659e382c7f19999898f00871367cb413231be6920e2390276fe
generated_at: 2026-10-15T10:14:45.199447+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/epoch.test.ts

## Purpose

Unit tests for the two epoch-predation predicates in `session/epoch`: `predatesSessionEpoch` (token-side, shared by the resolver and refresh path) and `proofPredatesEpoch` (login-proof side at the mint). The file pins down the boundary behavior of each so that a refactor or timezone change cannot silently alter which tokens/proofs are rejected.

## Key elements

- **`describe('predatesSessionEpoch')`** — four cases around a fixed epoch (`2026-10-06T12:00:00.900Z`):
  - `undefined` epoch → always `false`.
  - Token second **before** epoch second → `true` (refused).
  - Token second **equal to** epoch second → `false` (kept; "survives its own bump").
  - Token second **after** epoch second → `false`.
- **`describe('proofPredatesEpoch')`** — three cases with the same epoch:
  - `undefined` epoch → always `false`.
  - Proof timestamp **1 ms before** epoch (same second) → `true` (refused).
  - Proof timestamp **equal to or after** epoch ms → `false`.

## Relationships

- Imports and exercises `predatesSessionEpoch` and `proofPredatesEpoch` from `src/modules/account/session/epoch.ts`. No other module is touched.

## Notes

- The two functions operate at **different time granularities**: `predatesSessionEpoch` compares integer seconds (`Math.floor(epoch.getTime()/1000)`), while `proofPredatesEpoch` compares raw millisecond timestamps. This is intentional—tokens carry second-resolution stamps, proofs carry millisecond-resolution ones.
- The boundary convention is **inclusive on the epoch side** for both functions: a value stamped *at* the epoch instant is kept, not refused. The test names call this out explicitly ("keeps a token stamped in the very second of the bump").
- The fixed date is a future date (2026) chosen to be safely outside any realistic "current time" window, making the tests deterministic without mocks.
