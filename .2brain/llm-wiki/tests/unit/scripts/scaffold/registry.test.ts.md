---
source: tests/unit/scripts/scaffold/registry.test.ts
sha256: 827e9c47a5f132e7c6fc36de2911eeb5ccc3aa0ec07159efabc9672a6f107185
generated_at: 2026-11-08T10:42:27.899970+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/registry.test.ts

## Purpose

Unit tests for the `registerModule` and `isRegistered` helpers that surgically edit the three alphabetical lists (imports, `enabledModules` array, `ModuleName` union) in `src/modules.ts`. The tests verify correct insertion, sorting, and terminator preservation without ever touching the real source file.

## Key elements

- **`REGISTRY`** – A hand-written string fixture that mirrors the shape of `src/modules.ts`: three import lines, an `enabledModules` array, a function that follows the array, and a `ModuleName` union type.
- **`describe('registerModule', …)`** – Four cases:
  - *Middle insert* (`field-notes`): confirms the new entry lands between existing entries in all three lists.
  - *Last-position insert* (`zebras`): confirms the `];` terminator and union `;` move to the new last line, and that the function *after* the array is untouched.
  - *First-position / folder-vs-identifier sort* (`api-keys`): confirms imports sort by **folder name** (`api-keys` < `cart`) while the array sorts by **identifier** (`apiKeys` < `cart`).
  - *Missing union guard*: strips `export type ModuleName` from the fixture and expects `registerModule` to throw a message matching `/ModuleName/`.
- **`describe('isRegistered', …)`** – Two assertions: returns `true` for an existing import (`feedback`) and `false` for an absent one (`field-notes`).

## Relationships

- **`scripts/scaffold/names.ts`** – Provides `deriveNames`, which converts a kebab-case module folder name (e.g. `'field-notes'`) into the camelCase identifier, folder path, and raw name needed by `registerModule`. The test passes `deriveNames(…)` output directly into the function under test.
- **`scripts/scaffold/registry.ts`** – The module under test. `registerModule` performs the string-level edit; `isRegistered` does a read-only check. Both are the only functions imported from this file.

## Notes

- The fixture (`REGISTRY`) is intentionally **not** read from the real `src/modules.ts`; it is a static string so tests are deterministic and don't couple to the current module list. If the real file gains a new list or changes structure, the fixture must be updated by hand.
- The "last-position" test (`zebras`) exists specifically to catch a class of bugs where the trailing `;` or `];` is lost or duplicated on append.
- Sorting is **not** uniform: imports sort lexicographically by folder path, the array by identifier, and the union by raw string. The `api-keys` test pins this asymmetry.
