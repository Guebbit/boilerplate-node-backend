---
source: src/modules/locales/tests/unit/translations.test.ts
sha256: a57ac1028701155e39a1fd003455832e3cea5055faf0ccb52c66386de9ee2812
generated_at: 2026-09-23T18:55:03.249095+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/translations.test.ts

## Purpose

Unit tests for the pure function `deriveSourceDigest`, which computes a deterministic fingerprint of a translation's source fields. This file isolates the digest logic from any database or registry interaction; those concerns live in the sibling integration test.

## Key elements

- **`describe('deriveSourceDigest')`** — single test block covering four invariants:
    - _Key-order independence_ — reordering object keys yields the same digest.
    - _Value sensitivity_ — changing a field value changes the digest.
    - _Key presence sensitivity_ — adding a key (even with an empty-string value) changes the digest.
    - _Determinism_ — two calls with structurally identical input produce the same digest.

## Relationships

- **`src/modules/locales/repository.ts`** — the sole import target; exports the `deriveSourceDigest` function under test. No other module is touched here.

## Notes

- The module doc comment explicitly scopes this file to the _pure_ half of the translation write path. If you need tests that exercise Mongo collections or the translation registry, look in `../integration/translations.test.ts` instead.
- All assertions use `toBe` (strict reference/value equality), appropriate because the function returns a string digest.
