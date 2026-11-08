---
source: src/modules/account/tests/unit/session-proof.test.ts
sha256: 498149e1bccef59df20e17dc0a6046ab22c01452702019d5ac1f40459ff3c6b6
generated_at: 2026-11-08T04:50:15.757155+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-proof.test.ts

## Purpose

Unit tests for the session-proof domain logic in `../../domain/session-proof`. They verify two rules: proofs are combined without duplicates while preserving the input array, and first-session refusal only applies to armed accounts lacking an `otp` proof.

## Key elements

- **`withProofs`** — tested for two behaviors: (1) appending new proofs after existing ones, deduplicating (e.g., passing `otp` when it's already present is a no-op); (2) non-mutation — the carried-in array is left unchanged.
- **`firstSessionRefused`** — tested via a table (`it.each`) of six `(armed, amr, refused)` cases. The refusal rule: `armed === true` AND `otp` is absent from `amr` → `true`; all other combinations → `false`.

## Relationships

- Imports `AMR`, `firstSessionRefused`, and `withProofs` from `src/modules/account/domain/session-proof.ts`. All assertions are against those three exports and no other module.

## Notes

- `AMR` is used as an enum-like map of AMR values (`AMR.password` → `'pwd'`, `AMR.otp` → `'otp'`, `AMR.email` → `'email'`), so tests read as symbols but compare against the string values.
- The non-mutation test for `withProofs` is deliberate: it guards against the implementation mutating the caller's array in place.
- The `firstSessionRefused` table includes the `armed: false` cases explicitly to pin down that disarmed accounts are *never* refused, regardless of proofs.
