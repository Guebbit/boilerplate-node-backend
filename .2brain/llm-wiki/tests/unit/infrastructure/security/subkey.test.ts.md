---
source: tests/unit/infrastructure/security/subkey.test.ts
sha256: 0d0fa70c852e99e7ea104df5dae449382afe1e84c9f0a66fb76656a0b508f9fc
generated_at: 2026-10-15T13:20:20.804758+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/subkey.test.ts

## Purpose

Unit tests for `deriveSubkey`, the HKDF-SHA256 key-derivation helper. They lock in the algorithm's correctness against a published RFC vector, verify that distinct inputs yield distinct keys, confirm the caching contract, and assert the output shape (32-byte secret key).

## Key elements

- **`describe('deriveSubkey()')`** — single suite with five cases:
  - *RFC 5869 A.3 vector* — feeds 22 bytes of `0x0B` (as `'\u000B'.repeat(22)`) with an empty info string and asserts the first 32 hex bytes of the OKM. Serves as a known-answer guard against swapped argument order or a wrong digest.
  - *Distinct purposes → distinct keys* — same root, two different info strings; asserts `.equals()` is false.
  - *Distinct roots → distinct keys* — same info, two different roots; asserts `.equals()` is false.
  - *Caching* — calls `deriveSubkey` twice with identical arguments and asserts referential identity (`toBe`).
  - *Output shape* — asserts `key.type === 'secret'` and `key.symmetricKeySize === 32`.

## Relationships

- **`src/infrastructure/security/subkey.ts`** — the sole import target; this file exercises `deriveSubkey` exclusively. No other modules are referenced.

## Notes

- The RFC vector encodes the 0x0B byte as the ASCII control character U+000B so it can live in a string literal without escaping hex.
- The caching test uses `toBe` (SameValue), not `toEqual`—it verifies the function returns the *same object reference*, not merely an equal one.
- `export()` is called to obtain a `Buffer` for hex comparison or `equals()` checks; the underlying key object retains its WebCrypto-like surface (`type`, `symmetricKeySize`).
