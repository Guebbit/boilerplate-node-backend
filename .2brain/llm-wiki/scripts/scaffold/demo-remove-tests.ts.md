---
source: scripts/scaffold/demo-remove-tests.ts
sha256: f116a7bf18b95de63022e4a9be33989eaf4541d165dc9ec22f272cab5f2c648e
generated_at: 2026-10-14T14:32:26.035780+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-tests.ts

## Purpose
The test-removal step of the `demo-remove` scaffold. Given a set of module names whose folders have already been deleted, it finds every `.ts` test file (in the repo-level `tests/` tree and in each surviving module's own `tests/` folder) that transitively depends on a removed module and deletes it. It exists so that removing a module also removes the orphaned tests that could no longer run.

## Key elements
- **`removeResidueTests(repoRoot, names)`** (exported) — Entry point. Runs a fixpoint loop over all discovered test files; deletes any file whose specifiers or `// requires-module:` declarations reference a gone path. Returns an array of `RemovalNote` objects (one per deleted file, relative path + detail string).
- **`testRoots(repoRoot)`** — Returns the list of directories to scan: the top-level `tests/` folder plus each `src/modules/<name>/tests/` folder that exists.
- **`walkTypeScript(directory)`** — Recursively collects every `.ts` file under a directory.
- **`SPECIFIER_PATTERNS`** — Three regexes that extract module specifiers only from *statement-leading* import/export/dynamic-import/require/jest.mock syntax, so fixture strings that merely quote an import are not matched.
- **`REQUIRES_MODULE`** — Regex for `// requires-module: a, b` comment lines that declare a soft dependency without a real import.
- **`requiredModules(source)`** — Parses all `requires-module` declarations in a file.
- **`specifiersOf(source)`** — Extracts every import/require specifier via `SPECIFIER_PATTERNS`.
- **`resolveSpecifier(specifier, importer, repoRoot)`** — Maps `@modules/…`, `@scenarios/…`, `@tests/…`, and relative specifiers to absolute paths; returns `undefined` for package specifiers.
- **`isGone(resolved, gone)`** — Checks whether a resolved path equals or is inside one of the "gone" target paths (module folders, scenario files, doubles folders, or previously-deleted test files).

## Relationships
- **`scripts/scaffold/demo-remove-registry.ts`** — This file imports the `RemovalNote` type from it; the returned notes feed into the registry's record of what the scaffold removed.
- **`scripts/scaffold/demo-remove-modules.ts`** — Sibling step in the same scaffold; the module-removal step runs before this one and produces the `names` array passed to `removeResidueTests`.
- **`tests/unit/scripts/scaffold/demo-remove-tests.test.ts`** — Unit tests for this file's behavior (specifier extraction, cascade deletion, `requires-module` handling).
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** and **`tests/unit/scripts/pairing/spec-identity.test.ts`** — Referenced in the dependency graph as related test suites; they exercise code paths that depend on the same specifier-resolution conventions this file relies on.

## Notes
- The fixpoint loop is necessary: deleting test A may orphan test B that imports A. Each pass adds newly-deleted files to the `gone` list so the next pass catches transitive dependents.
- `gone` includes not just the module folders but also `scenarios/<name>` and `scenarios/support/doubles/<name>`, because a test importing a scenario fixture for a removed module is equally orphaned.
- The specifier regexes are deliberately anchored to line-start (or a `from` keyword) to avoid matching import strings inside test fixtures, ESLint rule inputs, or this script's own test files.
- The file uses `unlinkSync` directly (no recursive directory removal); it assumes each target is a single `.ts` file, not a directory.
- `isGone` also matches `target.` (with a trailing dot) to catch cases where a resolved path is the target with an extension appended (e.g. `foo.ts` when the target is `foo`).
