---
source: tests/unit/scripts/docs/repo-references.test.ts
sha256: bd4703e03b60ad1831b3696a057d3a7f85f009d1ea8edd5efd4b8b7dfbe24a4a
generated_at: 2026-09-27T16:13:10.395961+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/repo-references.test.ts

## Purpose

Unit test for the `gitEnvironment` helper in `scripts/docs/repo-references.ts`. It verifies that the helper correctly removes the three Git-injected environment variables (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`) so that a nested `execFileSync('git', …)` call from inside a pre-commit hook resolves against its own `cwd` rather than the hook's repo.

## Key elements

- **`HOOK_VARS`** — tuple of the three env var names that the pre-commit hook exports into its child process.
- **`previous`** — module-level record used to snapshot the original values of those vars before each test.
- **`beforeEach` / `afterEach`** — save and restore the three vars so tests are hermetic and don't leak into subsequent tests.
- **`describe('gitEnvironment')`** block with three cases:
  - *strips GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE* — asserts all three are `undefined` in the returned object.
  - *leaves every other variable untouched* — asserts `PATH` passes through unchanged.
  - *is a no-op copy when none of the three are set* — asserts the returned object deep-equals `process.env`.

## Relationships

- **`scripts/docs/repo-references.ts`** — the module under test; this file imports `gitEnvironment` from it and exercises only that single export.

## Notes

- The tests mutate `process.env` directly and rely on the `beforeEach`/`afterEach` save-restore pattern rather than a Jest `spyOn`. This means the tests are order-sensitive only if those helpers are removed.
- `gitEnvironment` is expected to return a *copy* of `process.env` (not the live object), as evidenced by the third test comparing with `toEqual` after deleting the keys from `process.env`.
