---
source: scripts/scaffold/demo-remove-tests.ts
sha256: 39e6f996e4f4a31ac093f5c8642c1f3fcd5f8ec62dfaea47c1be8763a8219254
generated_at: 2026-11-08T02:58:57.366626+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-tests.ts

## Purpose

The test-cleanup step of the `demo-remove` scaffold pipeline. Given a set of already-deleted module names, it finds and deletes every test file that (transitively) imports a removed module or declares it via a `// requires-module:` comment, cascading until no new orphans remain.

## Key elements

- **`removeResidueTests(repoRoot, names)`** — exported entry point. Walks all test roots, iteratively resolves imports and `requires-module` declarations against the removed-module paths (including their scenario fixtures and test doubles), collects orphans transitively, then unlinks them. Returns `RemovalNote[]` (relative path + detail string).
- **`testRoots(repoRoot)`** — builds the search space: the top-level `tests/` directory plus each surviving module's own `tests/` folder (discovered via `modulesWith`).
- **`walkTypeScript(directory)`** — recursive `.ts` file enumerator.
- **`SPECIFIER_PATTERNS`** — anchored regexes that match only statement-leading import/export-from, dynamic `import()`, `jest.mock()`, and `require()` specifiers, avoiding false positives from quoted fixtures.
- **`REQUIRES_MODULE`** — matches `// requires-module: a, b` comment lines.
- **`specifiersOf(source)`** / **`requiredModules(source)`** — extract specifiers / declared module names from source text.
- **`resolveSpecifier(specifier, importer, repoRoot)`** — maps `@modules/…`, `@scenarios/…`, `@tests/…`, and relative paths to absolute repo paths; returns `undefined` for bare package names.
- **`isGone(resolved, gone)`** — prefix check (with path-separator and dot boundary) to see whether a resolved target falls inside a removed folder or deleted file.

## Relationships

- **`scripts/modules-on-disk.ts`** — imports `modulesWith` to discover which sibling modules still have a `tests/` directory, building the search roots.
- **`scripts/scaffold/demo-remove-registry.ts`** — imports the `RemovalNote` type used as the return shape of `removeResidueTests`.
- **`scripts/scaffold/demo-remove-modules.ts`** — sibling step in the same pipeline; this file runs *after* modules are deleted and uses the same `names` list.
- **`tests/unit/scripts/scaffold/demo-remove-tests.test.ts`** — unit tests for this module's cascade and specifier-resolution logic.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — integration-level test that exercises the remove pipeline including this step.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — verifies spec-identity invariants that constrain how this file resolves and matches specifiers.

## Notes

- The cascade loop (`for (let changed = true; …)`) is necessary because deleting one test can orphan another that only imported the first; a single pass would miss transitive orphans.
- `gone` is seeded with three paths per module name (module folder, scenario fixture file, and doubles directory), so a test importing *either* the scenario or a double is treated as orphaned, not just one importing `@modules/<name>`.
- The anchored regexes deliberately require the specifier to appear at line start (or after `from` on a continuation line) so that this script's own test fixtures and ESLint-rule test inputs—strings that *contain* import syntax—are not misread as real imports.
- `isGone` checks both `startsWith(target + path.sep)` (folder containment) and `startsWith(target + '.')` (file-level match, e.g. a deleted `foo.ts` vs. a surviving `foo-bar.ts`).
