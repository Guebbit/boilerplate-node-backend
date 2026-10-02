---
source: scripts/ops/demo-remove-tests.ts
sha256: e626f20ebdd13f5699d954cb4830c05f6c699f2071713eda12812c26292ad724
generated_at: 2026-10-01T12:35:36.858086+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-tests.ts

## Purpose

Removes test files that depend on already-deleted modules. As the test-cleanup step of the `demo-remove` operation, it walks every test location, detects files that import a removed module (directly or transitively through another test), and deletes them—returning a note per file.

## Key elements

- **`removeResidueTests(repoRoot, names)`** — exported entry point. Iteratively scans all `.ts` test files, resolves their imports and `// requires-module:` annotations against the set of removed modules and their scenario fixtures, and unlinks every orphaned file. Returns `RemovalNote[]`.
- **`testRoots(repoRoot)`** — collects the search roots: the system-level `tests/` directory plus each surviving module's `src/modules/<name>/tests/` folder.
- **`walkTypeScript(directory)`** — recursively lists all `.ts` files under a directory.
- **`SPECIFIER_PATTERNS`** — three line-anchored regexes that match real `import`/`export … from`/`jest.mock()`/`import()`/`require()` specifiers while ignoring those that merely appear inside string literals.
- **`REQUIRES_MODULE`** / **`requiredModules(source)`** — parses `// requires-module: a, b` annotation lines to capture implicit module dependencies.
- **`specifiersOf(source)`** — extracts every module specifier found in a file via `SPECIFIER_PATTERNS`.
- **`resolveSpecifier(specifier, importer, repoRoot)`** — maps a path alias (`@modules/`, `@scenarios/`, `@tests/`) or relative path to an absolute path; returns `undefined` for bare package names.
- **`isGone(resolved, gone)`** — checks whether a resolved path is inside (or is) any of the removed-module folders or previously deleted files.

## Relationships

- **`scripts/ops/demo-remove-registry.ts`** — provides the `RemovalNote` type that `removeResidueTests` returns.
- **`scripts/ops/demo-remove-modules.ts`** — sibling step in the same `demo-remove` operation; deletes the module folders first, after which this script cleans up the orphaned tests.
- **`tests/unit/scripts/ops/demo-remove-tests.test.ts`** — unit tests exercising the removal logic.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — covers the CI wave orchestration that invokes this script.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — tests specifier-identity pairing that this file's resolution logic participates in.

## Notes

- Deletion is **transitive**: removing a test that itself is imported by another test cascades in the next loop iteration (the `for (let changed = true; …)` loop).
- Scenario fixtures (`scenarios/<name>.ts`) are added to the "gone" set alongside the module folder, so a test importing a fixture is treated the same as one importing the module.
- `SPECIFIER_PATTERNS` are deliberately anchored to line start (or `from` continuation) so that specifiers appearing inside quoted strings—e.g. ESLint rule test inputs in the repo's own test files—are **not** mistaken for real imports.
- `isGone` matches both `target + path.sep` (folder contents) and `target + '.'` (sibling files like `scenarios/foo.ts`), covering the two ways a resolved path can relate to a gone entry.
