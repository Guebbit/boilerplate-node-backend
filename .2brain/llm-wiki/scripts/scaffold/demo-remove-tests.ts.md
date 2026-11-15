---
source: scripts/scaffold/demo-remove-tests.ts
sha256: b3f3c183ee13ddc028fc921d6b6aabffaeec7a51930559ee9e233e7304c8cb75
generated_at: 2026-11-14T17:40:29.975588+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-tests.ts

## Purpose

The test-removal step of the `demo-remove` scaffold. Given a set of module names whose folders have already been deleted, it finds every test file that imports (directly or transitively) one of those modules—or declares a `// requires-module:` dependency on one—and deletes the file. It runs iteratively so that tests importing a now-deleted test file are also caught, and it returns one `RemovalNote` per deleted file.

## Key elements

- **`removeResidueTests(repoRoot, names)`** — exported entry point. Collects all `.ts` test files, resolves their import specifiers against the removed-module targets (module folders, scenario fixtures, doubles), checks `// requires-module:` annotations, then loops until no new deletions appear. Returns `RemovalNote[]`.
- **`testRoots(repoRoot)`** — builds the list of directories to scan: the top-level `tests/` tree plus each surviving module's own `tests/` folder (discovered via `modulesWith`).
- **`walkTypeScript(directory)`** — recursive collector of all `.ts` file paths under a directory.
- **`SPECIFIER_PATTERNS`** — three line-anchored regexes that extract specifiers from `import … from`, bare `import "…"`, and `jest.mock`/`import()`/`require()` calls. Anchoring prevents matching specifiers that merely appear inside string literals.
- **`REQUIRES_MODULE`** — regex for the `// requires-module: a, b` comment convention.
- **`requiredModules(source)` / `specifiersOf(source)`** — thin extractors returning the list of names or specifiers in a source string.
- **`resolveSpecifier(specifier, importer, repoRoot)`** — maps a specifier to an absolute path, handling `@modules/`, `@scenarios/`, `@tests/`, and relative paths; returns `undefined` for bare package names.
- **`isGone(resolved, gone)`** — true if the resolved path equals or sits inside one of the removed targets (folder, file, or `file.` prefix).

## Relationships

- **`scripts/scaffold/demo-remove-registry.ts`** — source of the `RemovalNote` type that `removeResidueTests` returns.
- **`scripts/modules-on-disk.ts`** — provides `modulesWith`, used to discover which surviving modules have their own `tests/` folder.
- **`scripts/scaffold/demo-remove-modules.ts`** — sibling scaffold step (module-folder deletion) that runs before this file; its deletions are the inputs here.
- **`tests/unit/scripts/scaffold/demo-remove-tests.test.ts`** — unit tests exercising `removeResidueTests`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI wave mutation test that exercises the scaffold pipeline including this step.

## Notes

- Deletion is **cascading**: once a test file is marked deleted, its path (minus `.ts`) is pushed onto the `gone` list, so a later file that imports it is also removed in the same or a subsequent loop iteration.
- The "gone" targets include not just `src/modules/<name>/` but also `scenarios/<name>.ts` and `scenarios/support/doubles/<name>/`, because tests that only use a module's fixtures as sample data are equally orphaned.
- `SPECIFIER_PATTERNS` is deliberately line-anchored so that a fixture string quoting an import (e.g., in this file's own tests or an ESLint rule's test input) is **not** mistaken for a real import.
- The `// requires-module:` comment is the sole mechanism for declaring a dependency on a module without a static import; it must be a full-line comment and lists comma-separated module names.
