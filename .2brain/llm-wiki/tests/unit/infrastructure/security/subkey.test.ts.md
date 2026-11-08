---
source: tests/unit/infrastructure/security/subkey.test.ts
sha256: 0d0fa70c852e99e7ea104df5dae449382afe1e84c9f0a66fb76656a0b508f9fc
generated_at: 2026-11-08T10:24:58.584971+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/subkey.test.ts

## Purpose

Unit tests for `deriveSubkey`, the HKDF-SHA256 key-derivation helper in the security infrastructure layer. The suite validates RFC conformance, key uniqueness across inputs, instance caching, and output shape, so that regressions in argument order, digest choice, or caching logic are caught immediately.

## Key elements

- **`deriveSubkey()` test suite** — a single `describe` block with five `it` cases:
  - **RFC 5869 A.3 vector** — feeds 22 × `0x0b` (as `'\u000B'.repeat(22)`), empty info, and asserts the first 32 bytes of OKM match the published hex digest.
  - **Info separation** — same root, two different info strings → different keys.
  - **Root separation** — two different roots, same info → different keys.
  - **Cache identity** — repeated call with identical arguments returns the *same* object reference (`toBe`).
  - **Output shape** — result has `type: 'secret'` and `symmetricKeySize: 32`.

## Relationships

- **`src/infrastructure/security/subkey.ts`** — the sole import; every assertion exercises the `deriveSubkey` function exported from that module.

## Notes

- The RFC vector intentionally uses **empty salt and empty info**, the simplest Appendix A.3 case; a transposed argument order or wrong digest would fail against the fixed hex string.
- The cache test uses `toBe` (reference equality), not `toEqual`. This is deliberate: it verifies the implementation memoizes the `KeyObject` instance rather than re-deriving an equivalent one.
- The `root` in the RFC test is a JS string of 22 U+000B characters, relying on the implementation treating each character as one byte. If the production code ever switches to a `Buffer` or `Uint8Array` input type, this fixture will need updating.
