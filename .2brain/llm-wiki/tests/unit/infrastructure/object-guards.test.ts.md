---
source: tests/unit/infrastructure/object-guards.test.ts
sha256: a3f0b7aab53b35d7509e694b51dd06e115b5ebb135d6b1c730248d5ddaef7050
generated_at: 2026-10-15T13:16:55.542235+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/object-guards.test.ts

## Purpose

Unit tests for the `stripUndefined` utility, verifying that it removes only `undefined`-valued keys (so Mongoose `default:` values can apply) while preserving every other value, including other falsy ones.

## Key elements

- **`describe('stripUndefined')`** — single test suite with four cases:
  - Drops keys whose value is `undefined` (e.g. `{ a: 1, b: undefined }` → `{ a: 1 }`).
  - Preserves `null`, `0`, `''`, and `false` as legitimate values a factory may set explicitly.
  - Returns `{}` when every key was `undefined`.
  - Does **not** mutate the input object (keys remain on the source after the call).

## Relationships

- **`src/infrastructure/object-guards.ts`** — the sole import source; this file tests the `stripUndefined` export.

## Notes

- The suite is intentionally narrow: it pins down the *only* value treated as "unspecified" (`undefined`) versus meaningful falsy values. Adding a `null`-stripping rule would break the second test.
- The non-mutation test guards against an implementation that uses `delete` on the input rather than building a new object.
