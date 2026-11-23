---
source: scripts/scaffold/demo-remove-tests.ts
source_sha256: 99fcd86a8fe75b7d55254978b06af81ee80bc81e59464bed2c4d537af347c2ec
context_sha256: ff397cd83274b434999a32abe52f6f3838c341eab9f243018ad0a07467ca74bf
generated_at: 2026-11-22T02:15:08.514947+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/demo-remove-tests.ts

## Purpose
Implements the test step of module removal (`demo-remove.ts`). After a module's folder is deleted, this deletes every test file that imports it, declares `// requires-module:` for it, or imports another test that was itself deleted. Whole-file deletion is safe because foundation tests keep shop-dependent cases in separate files, so other coverage isn't lost.

## Key elements
- `removeResidueTests(repoRoot, names)` — the only export. Collects test files, computes a fixpoint of deletions, unlinks them, and returns a `RemovalNote[]` (`file` relative to repo root, `detail: 'deleted — imports or requires a removed module'`).
- `testRoots` — test locations: `<repo>/tests` plus each surviving module's `tests/` folder (found via `modulesWith(modulesDirectory, 'tests')`). Only existing directories are kept.
- `walkTypeScript` — recursively lists `.ts` files under a directory.
- `SPECIFIER_PATTERNS` / `specifiersOf` — line-anchored regexes extracting specifiers from `import`/`export ... from`, side-effect `import`, and `jest.mock`/`requireActual`/`doMock`/`import()`/`require()` calls.
- `REQUIRES_MODULE` / `requiredModules` — parse `// requires-module: a, b` comment lines (comma-separated module names).
- `resolveSpecifier` — maps `@modules/…`, `@scenarios/…`, `@tests/…` (to `tests/support/`) and relative paths to absolute paths; packages return `undefined`.
- `isGone` — true if a resolved path equals, is under, or is an extension-variant (`target.`) of a removed path.

## Relationships
- `scripts/modules-on-disk.ts` — supplies `modulesWith`, used to find surviving modules' `tests/` folders.
- `scripts/scaffold/demo-remove-registry.ts` — supplies the `RemovalNote` type that is returned.
- `scripts/scaffold/demo-remove-modules.ts` — sibling removal step; this one runs after module folders are already deleted (`names` are removed modules whose folders are gone).
- `tests/unit/scripts/scaffold/demo-remove-tests.test.ts` — unit tests for this file.
- `tests/unit/scripts/mutation/ci/waves.test.ts` — listed as a graph neighbor; the file itself shows no interaction with it.

## Notes
- The "gone" set starts as each removed module's `src/modules/<name>`, `scenarios/<name>`, and `scenarios/support/doubles/<name>` paths; each deleted test file (minus `.ts`) is added, so transitive importers are caught on later passes.
- Regexes are anchored to line starts so fixtures that merely quote an import inside a string (ESLint rule inputs, this script's own tests) aren't mistaken for real imports.
- Files are only unlinked after the fixpoint loop completes.
- `requires-module` is the escape hatch for tests that depend on a module without importing it (e.g., those driving the kernel through the shop's subjects and roles).
