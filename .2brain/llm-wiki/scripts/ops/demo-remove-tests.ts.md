---
source: scripts/ops/demo-remove-tests.ts
sha256: f116a7bf18b95de63022e4a9be33989eaf4541d165dc9ec22f272cab5f2c648e
generated_at: 2026-10-14T07:22:38.823360+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-tests.ts

## Purpose

Cleans up test files that are orphaned by a module removal. After `demo-remove-modules.ts` deletes a module's folder, this script walks the surviving test tree and deletes any `.ts` test file that imports (directly or transitively) the removed module, its scenario fixture, or its test doubles — or that declares a `// requires-module:` dependency on it. It cascades until no further test is orphaned, returning a `RemovalNote` per deleted file.

## Key elements

- **`removeResidueTests(repoRoot, names)`** (exported) — Main entry point. Builds the set of "gone" paths (module folders, scenario fixtures, doubles), then iteratively scans all test files, deletes any that import/require a gone path, and repeats until the set stabilises. Returns one `RemovalNote` per deleted file.
- **`testRoots(repoRoot)`** — Collects search roots: the top-level `tests/` directory plus each `src/modules/<name>/tests/` folder that exists.
- **`walkTypeScript(dir)`** — Recursive listing of all `.ts` files under a directory.
- **`SPECIFIER_PATTERNS`** — Three anchored regexes that extract import/export/dynamic-import specifiers from source text while ignoring specifiers that appear only inside string literals (e.g. ESLint fixture inputs).
- **`REQUIRES_MODULE`** / **`requiredModules(source)`** — Parses `// requires-module: a, b` comment lines to capture declared (non-import) dependencies.
- **`specifiersOf(source)`** — Returns every module specifier found in a file's source.
- **`resolveSpecifier(specifier, importer, repoRoot)`** — Maps a specifier to an absolute path. Handles `@modules/`, `@scenarios/`, `@tests/` aliases and relative paths; returns `undefined` for bare package names.
- **`isGone(resolved, gone)`** — True if the resolved path is inside (or is) a gone folder or deleted file.

## Relationships

- **`scripts/ops/demo-remove-registry.ts`** — Imports the `RemovalNote` type used as the return shape of `removeResidueTests`.
- **`scripts/ops/demo-remove-modules.ts`** — Predecessor step in the removal pipeline; deletes the module folders that this script then cleans up. This script expects those folders to already be gone.
- **`tests/unit/scripts/ops/demo-remove-tests.test.ts`** — Unit tests exercising the cascade logic, specifier resolution, and `requires-module` handling.

## Notes

- The specifier regexes are deliberately anchored to line-start (`^\s*`) so that import-like strings inside test fixtures (e.g. ESLint rule inputs, or this script's own tests) are not mistaken for real imports. A fixture that *quotes* an import is safe.
- The cascade loop matters: deleting test A may orphan test B that only imported A's helper. The loop re-scans until no new file falls out.
- `isGone` matches both directory containment (`target + path.sep`) and file-prefix (`target + '.'`), so importing a specific deleted `.ts` file (not just a folder) also triggers deletion.
- `scenarios/<name>.ts` and `scenarios/support/doubles/<name>/` are treated as part of the removed module, so tests importing those fixtures are deleted too.
