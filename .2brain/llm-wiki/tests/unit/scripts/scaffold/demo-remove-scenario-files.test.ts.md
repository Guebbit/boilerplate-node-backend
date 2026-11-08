---
source: tests/unit/scripts/scaffold/demo-remove-scenario-files.test.ts
sha256: 411c6a3fee12b0735d0b35fa6e7a4ea0af5002748a58dab0fee0bc50c7b30f60
generated_at: 2026-11-08T10:41:12.775534+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-scenario-files.test.ts

## Purpose

Unit test for `removeScenarioModuleFiles`, verifying that removing a demo module deletes only that module's scenario artifacts (fixture file, values file, and doubles folder) while leaving other modules' files untouched.

## Key elements

- **`write(relative)`** — helper that creates a stub file (`export {};`) at a path under the throwaway temp root, creating parent directories as needed.
- **`exists(relative)`** — helper that checks whether a path exists under the throwaway temp root.
- **`beforeEach`** — creates a unique temp directory (`mkdtempSync`) and populates it with a realistic `scenarios/` tree for two demo modules (`payments` and `users`), including nested `values/` and `support/doubles/` sub-paths.
- **`afterEach`** — recursively removes the temp directory.
- **`describe('removeScenarioModuleFiles')`** — the test suite containing two cases:
  - *deletes a removed module's fixtures, example values and doubles folder, and nothing else* — calls `removeScenarioModuleFiles(root, ['payments'])`, asserts the three payments paths are gone, the two users paths survive, and the returned notes array lists exactly the three removed paths in order.
  - *reports nothing for a module that has no scenario files* — calls with `['wishlist']`, asserts an empty array is returned and the payments doubles folder is still present.

## Relationships

- **`scripts/scaffold/demo-remove-scenarios.ts`** — the module under test; this file imports `removeScenarioModuleFiles` from it.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — sibling unit test in the adjacent `tests/unit/scripts/` tree; no direct code dependency between the two files.

## Notes

- The temp root uses `mkdtempSync` (not a fixed path), so tests are parallel-safe and leave no residue on failure beyond the OS temp dir.
- The test asserts the **order** of the `notes` array, which couples the test to the internal iteration order of `removeScenarioModuleFiles`.
- Stub files contain only `export {};` — the test cares about file/folder existence, not content.
- The doubles path is asserted with `exists('scenarios/support/doubles/payments')` (the folder, not a file inside it), matching the function's reported note as a directory.
