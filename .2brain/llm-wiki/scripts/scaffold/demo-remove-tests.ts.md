---
source: scripts/scaffold/demo-remove-tests.ts
sha256: 39e6f996e4f4a31ac093f5c8642c1f3fcd5f8ec62dfaea47c1be8763a8219254
generated_at: 2026-10-15T09:46:15.539678+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-tests.ts

## Purpose

The test-deletion step of the `demo-remove.ts` scaffold workflow. After a module's source folders have already been removed, this file walks every surviving test file, detects which ones import (or declare `requires-module:`) a removed module — directly or transitively through other already-deleted tests — and deletes them. It returns one `RemovalNote` per deleted file so the caller can report what was cleaned up.

## Key elements

- **`removeResidueTests(repoRoot, names)`** — exported entry point. Accepts the repo root and the names of removed modules; performs the iterative (fixpoint) deletion loop and returns `RemovalNote[]`.
- **`testRoots(repoRoot)`** — collects the top-level test directories: the system `tests/` tree plus each surviving module's own `tests/` folder (discovered via `modulesWith`).
- **`walkTypeScript(dir)`** — recursive walk that yields every `.ts` file under a directory.
- **`SPECIFIER_PATTERNS`** — anchored regexes that match `import … from`, bare `import '…'`, and `jest.mock`/`import()`/`require()` calls, while ignoring specifiers that appear only inside string literals or fixtures.
- **`REQUIRES_MODULE` / `requiredModules(source)`** — parses `// requires-module: a, b` comment lines to catch tests that depend on a module without a syntactic import.
- **`specifiersOf(source)`** — concatenates all matched specifiers from a file's source text.
- **`resolveSpecifier(specifier, importer, repoRoot)`** — maps `@modules/…`, `@scenarios/…`, `@tests/…`, and relative paths to absolute repo paths; returns `undefined` for bare package names.
- **`isGone(resolved, gone)`** — tests whether a resolved path falls inside (or is) any of the known-deleted module folders/files, using path-separator-aware prefix matching.

## Relationships

- **`scripts/modules-on-disk.ts`** — calls `modulesWith(modulesDirectory, 'tests')` to discover which surviving modules have their own `tests/` directory, so those folders are included in the scan.
- **`scripts/scaffold/demo-remove-registry.ts`** — imports the `RemovalNote` type used as the return shape of `removeResidueTests`.
- **`scripts/scaffold/demo-remove-modules.ts`** — the preceding step in the same scaffold workflow that deletes the module source folders; this file assumes those folders are already gone ("their folders are already deleted") and only handles the test residue.
- **`tests/unit/scripts/scaffold/demo-remove-tests.test.ts`** — unit tests exercising the deletion logic (pattern matching, transitive cascade, `requires-module` handling).

## Notes

- The deletion loop is a **fixpoint**: a file deleted in one pass may cause another file (that imported it) to become orphaned in the next pass. The loop repeats until no new files are flagged.
- The `gone` list grows during the loop — each deleted test file is added (with its `.ts` extension stripped) so that other tests importing *that* test are also caught.
- Specifier regexes are intentionally **line-anchored** (`^\s*`) to avoid matching import-like strings inside fixture data (e.g., an ESLint rule's test input or this script's own test fixtures).
- `resolveSpecifier` handles exactly three alias prefixes (`@modules/`, `@scenarios/`, `@tests/`) plus relative paths; any other bare specifier is treated as an external package and skipped.
- Scenario fixtures (`scenarios/<name>.ts`) and test doubles (`scenarios/support/doubles/<name>/`) are included in the `gone` set, so a test importing either is deleted alongside the module itself.
