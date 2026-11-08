---
source: tests/unit/infrastructure/security/constant-time.test.ts
sha256: c1359c3a442e842b42e943a50c69ac8e5c34995cdb3ee62a5dac551065bfe522
generated_at: 2026-11-08T10:24:30.583343+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/constant-time.test.ts

## Purpose
Unit tests for `constantTimeEqual`, verifying its behavioural contract (equal inputs → `true`, unequal inputs → `false`, never throws on length mismatch). The tests acknowledge that the actual constant-time property — absence of a timing branch on input length — is not observable from a functional test; they pin down the observable API surface.

## Key elements
- **`describe('constantTimeEqual')`** — top-level suite importing `constantTimeEqual` from `@infrastructure/security/constant-time`. Contains five cases:
  - Equal strings → `true`
  - Different strings, same length → `false`
  - Different strings, different lengths → `false` (also asserts no throw)
  - Empty vs non-empty → `false`
  - Two empty strings → `true`

## Relationships
- **`src/infrastructure/security/constant-time.ts`** — the sole import under test. This file exercises its single exported function `constantTimeEqual` and does not mock or stub it.

## Notes
- The leading block comment explicitly notes that timing-safety is a non-observable property for a functional test suite; do not interpret the "different lengths" test as a timing measurement.
- Tests use string inputs only; the implementation may support other `ArrayBuffer`-like types, but this suite does not cover them.
- The `not.toThrow()` assertion is separate from the `toBe(false)` assertion in the length-mismatch case — a regression that throws on length inequality would be caught even if the return value were accidentally correct.
