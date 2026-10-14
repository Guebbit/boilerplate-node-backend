---
source: src/modules/account/tests/unit/session-proof.test.ts
sha256: 498149e1bccef59df20e17dc0a6046ab22c01452702019d5ac1f40459ff3c6b6
generated_at: 2026-10-14T14:46:09.742211+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-proof.test.ts

## Purpose

Unit tests for the session-proof domain rules: verifying that proofs are combined without duplicates (and without mutating the caller's array) and that only an armed account lacking an `otp` proof is refused a first session.

## Key elements

- **`describe('withProofs', …)`** — Two tests: (1) appending a new proof yields the expected ordered list, and re-adding an existing proof is a no-op; (2) the input array is not mutated.
- **`describe('firstSessionRefused', …)`** — A single `it.each` table covering six `(armed, amr, refused)` combinations that pin down the refusal logic.

## Relationships

- **`src/modules/account/domain/session-proof.ts`** — SUT (system under test). Imports `AMR`, `firstSessionRefused`, and `withProofs` directly; all assertions target these three exports.

## Notes

- `AMR.password` resolves to the string `'pwd'` and `AMR.otp` to `'otp'` in the expected outputs, so the enum values are single-letter shorthand rather than the property names.
- The non-mutation test (`does not change what it was given`) is the reason `withProofs` is expected to return a new array rather than splice into the argument — a regression here would be silent in callers that share the reference.
