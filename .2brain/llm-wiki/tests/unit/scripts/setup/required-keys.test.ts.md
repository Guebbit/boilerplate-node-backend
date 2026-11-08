---
source: tests/unit/scripts/setup/required-keys.test.ts
sha256: 3db1694356f5434fd2ce8a52040883b28d3158853708506649c3c980d1620649
generated_at: 2026-11-08T10:43:12.518196+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/setup/required-keys.test.ts

## Purpose

Unit tests for the `fillableKeys` helper, verifying that the list of placeholder keys returned for `npm run setup` is complete (well-known secrets present), correct (non-placeholder variables excluded), and free of duplicates. The test suite exists to lock in the contract that `fillableKeys` derives its answer from module declarations rather than a hand-maintained list.

## Key elements

- **`describe('fillableKeys')` block** — calls `fillableKeys()` once at describe scope and asserts on the returned array in three `it` blocks.
- **"finds at least the well-known session and metrics secrets"** — asserts the output includes `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, and `NODE_METRICS_TOKEN` (uses `arrayContaining`, so the list is allowed to grow).
- **"never includes an entry with no placeholder to replace"** — asserts `NODE_URL` is *not* in the result; that variable is an operator-supplied value, not a stand-in for `setup` to fill.
- **"carries no duplicate keys"** — asserts `new Set(names).size === names.length`, guarding against two modules declaring the same variable.

## Relationships

- **`scripts/setup/required-keys.ts`** — sole dependency; exports the `fillableKeys` function under test. This file is the only consumer in the test tree that exercises that export.

## Notes

- The test intentionally uses `expect.arrayContaining` rather than strict equality, so adding a new module secret does not break the suite. The header comment in the file makes this design intent explicit.
- `NODE_URL` is a required variable but is excluded from `fillableKeys` by contract; the negative assertion here is the guard that keeps it that way.
- The `keys` array is computed once per `describe` block (not per test), so all three assertions operate on the same snapshot.
