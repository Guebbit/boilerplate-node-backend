---
source: src/modules/account/tests/unit/epoch.test.ts
sha256: 17ad71ea3f0b3b5294976ba0f2981a7af0cd6ea34a7c78e24d20c03625f94cf3
generated_at: 2026-11-08T04:47:01.479576+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/epoch.test.ts

## Purpose

Unit tests for the two epoch-comparison predicates in the account domain: `predatesSessionEpoch` (shared by the resolver and the refresh path) and `proofPredatesEpoch` (used for a login's proof at the mint). The tests pin down boundary behavior at the exact epoch instant and the no-op case where no epoch has ever been set.

## Key elements

- **`describe('predatesSessionEpoch')`** — exercises the token-level check with **second** granularity:
  - `undefined` epoch → always `false` (no bump ever happened).
  - `epochSecond - 1` → `true` (token predates the bump).
  - `epochSecond` (same second as the bump) → `false` (token survives its own bump).
  - `epochSecond + 5` → `false`.
- **`describe('proofPredatesEpoch')`** — exercises the proof-level check with **millisecond** granularity:
  - `undefined` epoch → `false`.
  - `epoch.getTime() - 1` (one ms before) → `true`.
  - `epoch.getTime()` and `+ 1` → `false`.

## Relationships

- **Imports** `predatesSessionEpoch` and `proofPredatesEpoch` from [`src/modules/account/domain/epoch.ts`](../../domain/epoch.ts) — the sole dependency and the module under test.

## Notes

- The two functions operate at **different time granularities**: `predatesSessionEpoch` compares at whole-second resolution (caller floors to seconds), while `proofPredatesEpoch` compares at millisecond resolution. The boundary expectations reflect this: the same-second token is *kept*, but a proof one millisecond before the bump is *refused*.
- `undefined` for the epoch parameter is the "no epoch event has ever fired" sentinel; both functions must return `false` in that case. Tests use `0` as the token/proof timestamp in those cases.
