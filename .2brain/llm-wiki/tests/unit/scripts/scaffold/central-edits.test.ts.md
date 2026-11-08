---
source: tests/unit/scripts/scaffold/central-edits.test.ts
sha256: 1822bbd61bd21c782e504d5d146a5a5296a5e762d9b3d19486f244ceff9e0325
generated_at: 2026-11-08T10:40:32.114475+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/central-edits.test.ts

## Purpose

Unit tests for the `centralEdits` transforms that edit shared files *outside* a module's own folder (e.g. role YAML, parity canary table). The tests run against both real repo files and small inline samples so that a missing anchor is caught in this suite rather than at the first real scaffold run.

## Key elements

- **`editFor(file)`** – local helper that looks up the `apply` transform for a given repo-relative path from `centralEdits(names)`; throws if no edit matches.
- **`describe('the four central edits')`** – iterates every entry returned by `centralEdits` via `it.each`, reads the real file from `REPO_ROOT`, applies the transform, and asserts the output differs from the input.
- **`describe('the admin set list')`** – validates the YAML edit on `shared/authorization-roles.yaml` with an inline sample: correct insertion of a new set after the last entry at the right indentation, and a `throw(/anchor/)` when the `&admin_sets` anchor is absent.
- **`describe('the parity canary')`** – validates the TypeScript edit on the cross-cutting parity table: alphabetical insertion with preserved commas, end-append without a trailing comma, and a `throw(/known/)` guard when the table is missing. Uses `deriveNames('fabrics')` and `deriveNames('zebras')` to exercise the middle- and last-position cases.

## Relationships

- **`scripts/scaffold/central-edits.ts`** – the module under test; supplies `centralEdits(names)` which returns an array of `{ path, apply }` edits.
- **`scripts/scaffold/names.ts`** – supplies `deriveNames(moduleName)` to produce the conventional names (e.g. `ScaffoldProbeManagement`, `Fabric`) used both as the argument to `centralEdits` and as expected strings in assertions.
- **`tests/support/paths.ts`** – supplies `REPO_ROOT`, the absolute path to the repository root, used to resolve real file paths for `readFileSync`.

## Notes

- The first `describe` block reads **real files** from the working tree via `REPO_ROOT`; it will fail if a shared file is deleted or renamed without updating `centralEdits`.
- The YAML and parity tests use **inline string samples**, not real files, so they are hermetic and independent of repo state.
- The module docstring makes the intent explicit: this suite is the safety net for "anchor that stops existing in a shared file" failures, and should be fixed *here* before a scaffold run ever hits the problem.
