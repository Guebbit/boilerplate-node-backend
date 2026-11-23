---
source: src/modules/account/tests/unit/session-proof.test.ts
source_sha256: 498149e1bccef59df20e17dc0a6046ab22c01452702019d5ac1f40459ff3c6b6
context_sha256: a91c35580d13c67e7beb13556c9d994e5ef4164e2f5e6576b330d04d6b83d2ae
generated_at: 2026-11-22T04:08:58.596116+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/session-proof.test.ts

## Purpose
Unit tests for the session proof rules defined in `domain/session-proof`. They check that proofs combine without duplicates, and that only an armed account lacking the `otp` proof is refused a first session.

## Key elements
- **`describe('withProofs')`**
  - Adding a proof appends it after the carried ones, once only. `withProofs([AMR.password], AMR.otp)` and `withProofs([AMR.password, AMR.otp], AMR.otp)` both give `['pwd', 'otp']`.
  - The input array is not mutated.
- **`describe('firstSessionRefused')`**
  - A table-driven `it.each` over `(armed, amr)` pairs, each with an expected `refused` value.
  - Refused: armed with `['pwd']`, `[]` or `['email']`.
  - Not refused: armed with `['pwd', 'otp']`, and unarmed with `['pwd']` or `[]`.

## Relationships
Imports `AMR`, `firstSessionRefused` and `withProofs` from `src/modules/account/domain/session-proof.ts` and tests them directly. It has no other dependencies.

## Notes
- The tests show that `AMR.password` is `'pwd'` and that `AMR.otp` is `'otp'`.
- The table also uses the raw string `'email'` as an AMR value. It does not use an `AMR` constant for it.
