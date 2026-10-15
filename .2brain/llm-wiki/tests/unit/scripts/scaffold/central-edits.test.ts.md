---
source: tests/unit/scripts/scaffold/central-edits.test.ts
sha256: 5ce772de5387509d305a451b693561476e1f1ecfc8bef6e5e24e629e035475f7
generated_at: 2026-10-15T13:30:07.676046+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/central-edits.test.ts

## Purpose

Unit tests for `centralEdits()` that validate the four repo-wide edits (outside a module's own folder) both against small inline samples and against the **real** files in the repository. The goal is to catch a missing or moved anchor in a shared file at test time rather than at the first scaffold run.

## Key elements

- **`names`** – derived once via `deriveNames('scaffold-probe')`; the pseudo-module every case scaffolds.
- **`editFor(file)`** – helper that looks up the edit matching a repo-relative path in `centralEdits(names)` and returns its `apply` transform; throws if no edit matches.
- **`describe('the four central edits')`**
  - Asserts the exact, ordered list of four file paths the edits target.
  - Uses `it.each` to read each real file from `REPO_ROOT` and assert that `edit.apply(source)` changes the content (i.e. the anchor is still present).
- **`describe('the admin key lists')`**
  - Verifies the YAML roles edit appends the four permission keys at the correct indentation after the last entry.
  - Verifies the edit **throws** (matching `/anchor/`) when the YAML structure has no list entries.
- **`describe('the parity canary')`**
  - Verifies alphabetical insertion mid-table (using `deriveNames('fabrics')`).
  - Verifies end-of-table append with no trailing comma (using `deriveNames('zebras')`).
  - Verifies the edit **throws** (matching `/known/`) when the expected `known` record is absent.

## Relationships

- **`scripts/scaffold/central-edits.ts`** – the module under test; `centralEdits(names)` returns the array of `{ path, apply }` edits.
- **`scripts/scaffold/names.ts`** – `deriveNames()` produces the naming conventions (entity, entityPlural, etc.) used to parameterize the probe module and the parity-canary cases.
- **`tests/support/paths.ts`** – exports `REPO_ROOT`, the absolute path to the repository root, so the "apply to the real file" tests can `readFileSync` the actual target files.

## Notes

- The "apply to the real %s" test reads live repo files on every run; if a shared file is refactored and its anchor changes, this test fails **before** any scaffold script would.
- `editFor` intentionally throws on a missing path so a typo in a test string is immediately visible rather than silently skipped.
- The parity-canary tests use two different module names (`fabrics`, `zebras`) specifically to exercise alphabetical middle-insertion vs. end-append, ensuring comma handling is correct in both positions.
