---
source: src/modules/account/tests/unit/epoch.test.ts
sha256: 17ad71ea3f0b3b5294976ba0f2981a7af0cd6ea34a7c78e24d20c03625f94cf3
generated_at: 2026-10-29T03:04:18.369088+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/epoch.test.ts

## Purpose

Unit tests for the two epoch-comparison predicates exported by the account domain module. They pin down the boundary semantics (inclusive vs. exclusive at the bump moment) and the `undefined`-epoch short-circuit for both the token path and the login-proof path.

## Key elements

- **`describe('predatesSessionEpoch')`** — Four cases exercising `predatesSessionEpoch(tokenSecond, epoch?)`:
  - `undefined` epoch → always `false` (never refuses).
  - Token one second *before* the bump → `true` (refused).
  - Token in the *exact* second of the bump → `false` (caller survives its own bump).
  - Token later → `false`.
  - Note the input is in **seconds** (`Math.floor(epoch.getTime() / 1000)`).

- **`describe('proofPredatesEpoch')`** — Three cases exercising `proofPredatesEpoch(proofMs, epoch?)`:
  - `undefined` epoch → `false`.
  - Proof **1 ms** before the bump (same second) → `true` (refused).
  - Proof at exactly the bump or after → `false`.
  - Note the input is in **milliseconds** (`epoch.getTime() ± 1`).

## Relationships

- **`src/modules/account/domain/epoch.ts`** — The module under test. This file imports `predatesSessionEpoch` and `proofPredatesEpoch` from that module via the relative path `../../domain/epoch` and asserts their return values. No other files are imported or mocked.

## Notes

- The two functions differ in **granularity**: `predatesSessionEpoch` compares at second resolution (a token stamped in the bump second is kept), while `proofPredatesEpoch` compares at millisecond resolution (a proof 1 ms before the bump is refused even though it falls in the same second). This asymmetry is intentional and is the core behavior these tests lock in.
- The epoch fixture uses a future date (`2026-10-06`) with a non-zero millisecond (`.900`) to make the ms-boundary case unambiguous.
- No mocks, spies, or async logic — purely synchronous pure-function assertions.
