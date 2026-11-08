---
source: tests/unit/scripts/scaffold/demo-remove-authorization.test.ts
sha256: 0bc43545a95466a1a4b24c2a34e113125383daa51aec04d35ef676ad4aac378b
generated_at: 2026-11-08T10:40:55.120867+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-authorization.test.ts

## Purpose

Unit tests for the `demo-remove-authorization` scaffold script. Verifies that, after a module (e.g. `orders`) is logically removed, its authorization rules, sets, role grants, and conformance cases are correctly identified and stripped from the shared YAML files without corrupting unrelated content.

## Key elements

- **`write` / `read`** – small helpers that create/read files under a throwaway `os.tmpdir()` root (with recursive `mkdirSync`), isolating each test from the real repo.
- **`beforeEach`** – seeds the temp root with a realistic multi-module layout: two module `authorization.yaml` files, a `shared/contracts/authorization-keys.core.yaml`, a `shared/authorization-roles.yaml` (with a comment inside a `sets:` block and a trailing blank line), and a `shared/authorization-conformance.yaml` (YAML anchor `&admin`, multiple `cases:` entries).
- **`afterEach`** – tears down the temp root with `rmSync(root, { recursive: true, force: true })`.
- **`describe('the shared authorization files after a module is removed')`** – three test cases:
  - `readRemovedAuthorization(root, ['orders'])` returns the exact removed rules, sets, and surviving subjects.
  - `stripRoleGrants(root, …)` removes `OrderDisplay` / `OrderOwn` references, leaving a parseable `sets: []` for the affected role while preserving other roles.
  - `stripConformanceCases(root, …)` removes cases whose subject is the deleted one *and* cases whose caller permissions are *entirely* removed rules, but keeps cases that still hold a surviving permission (e.g. `read:User`).

## Relationships

- **`scripts/scaffold/demo-remove-authorization.ts`** – the module under test; this file imports `readRemovedAuthorization`, `stripConformanceCases`, and `stripRoleGrants` from it and exercises each against the seeded fixtures.

## Notes

- The fixtures deliberately include edge cases the tests assert on: a YAML comment *between* the `sets:` heading and its list items, a trailing blank line in `authorization-roles.yaml`, a YAML anchor (`&admin`) in the conformance file, and a conformance case whose caller holds *both* a removed and a surviving permission (only the "only removed" case should be stripped).
- The temp-dir pattern (`mkdtempSync` + `rmSync`) means the tests never touch the real working tree; they rely entirely on relative paths resolved against the `root` variable.
