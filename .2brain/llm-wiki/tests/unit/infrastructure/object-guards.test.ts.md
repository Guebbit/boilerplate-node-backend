---
source: tests/unit/infrastructure/object-guards.test.ts
sha256: 85a156658fa27d06e81bb3c6d5d6cb261aeecc081fb82c9f88c9e193da6a062a
generated_at: 2026-11-08T10:20:06.254232+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/object-guards.test.ts

## Purpose

Unit tests for the two object-normalization helpers in `src/infrastructure/object-guards.ts`. They lock in the contract that only `undefined` means "unspecified" while all other falsy values are deliberate, and that neither helper mutates its input.

## Key elements

- **`stripUndefined` (describe block, 4 tests)**
  - Verifies keys with `undefined` values are removed.
  - Confirms `null`, `0`, `''`, and `false` survive (they are meaningful values, not "absent").
  - Returns `{}` when every key was undefined.
  - Does not mutate the source object.

- **`fillOmittedWithNull` (describe block, 4 tests)**
  - Fills only the declared-but-absent fields with `null`; present fields are untouched.
  - Fills all fields when the input object is empty.
  - Leaves undeclared keys (e.g. `extra`) in place rather than stripping them.
  - Does not mutate the body object it receives.

## Relationships

- **`src/infrastructure/object-guards.ts`** — the sole dependency; this file imports `stripUndefined` and `fillOmittedWithNull` from it and exercises their public contracts. No other interaction.

## Notes

- The `null` vs `undefined` distinction is the whole point: in Mongoose a key present with value `undefined` suppresses the schema `default:`, whereas a missing key lets the default apply. The tests intentionally cover every common falsy value to prevent regressions where a "keep falsy" filter accidentally drops `0` or `false`.
- Immutability is asserted explicitly for both helpers; the production code must return new objects rather than modifying the caller's.
- `fillOmittedWithNull` is expected to *add* keys (the declared ones) but never remove existing ones, even if they weren't in the declared list.
