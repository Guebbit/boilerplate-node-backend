---
source: tests/unit/infrastructure/security/constant-time.test.ts
sha256: c1359c3a442e842b42e943a50c69ac8e5c34995cdb3ee62a5dac551065bfe522
generated_at: 2026-09-27T16:10:28.406976+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/constant-time.test.ts

## Purpose

Unit tests for `constantTimeEqual`, verifying its behavioural contract: correct boolean results for equal/unequal inputs and no thrown error on length mismatch. The file explicitly notes that the security-critical property (constant-time execution, no timing branch on input length) is **not** observable from a functional test, so these tests cover only the externally visible API.

## Key elements

- **`describe('constantTimeEqual')`** — single test suite with five cases:
  - Equal strings → `true`
  - Unequal strings, same length → `false`
  - Unequal strings, different lengths → `false` *and* no throw (explicitly asserted via `expect(() => …).not.toThrow()`)
  - Empty string vs non-empty → `false`
  - Two empty strings → `true`

## Relationships

- **Imports** `constantTimeEqual` from `@infrastructure/security/constant-time` (→ `src/infrastructure/security/constant-time.ts`). This is the sole dependency; the test has no other imports or collaborators.

## Notes

- The file's header comment states the "double-hash" implementation detail is the reason the timing property is untestable here. These tests are a **correctness** safeguard, not a **timing** one.
- The different-length case is deliberately split into two assertions (no-throw + correct value) to guard against a regression where the function might throw on mismatched lengths.
- No mocks, spies, or async utilities are used; every test is synchronous and pure.
