---
source: scripts/docs/generate-dependency-map.ts
sha256: f9d83e43590ee9d4872f3f3886fad0eaf908fcc8f8c85ec32ec6be779299b1ec
generated_at: 2026-10-14T07:15:16.008210+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-dependency-map.ts

## Purpose

Generates the two dependency tables (runtime and dev) inside `docs/tools/package-dependencies.md`. It reads `package.json`, scans production source for import specifiers, and classifies each package into a hand-kept group (from `dependency-groups.ts`), a single-module ownership row, or an "Ungrouped" leftover. Output is written between HTML comment markers via `marker-block.ts`; `--check` mode reports drift instead of rewriting.

## Key elements

- **`checkOnly`** — Boolean set when `--check` is in `process.argv`; switches `apply` to report-only mode.
- **`SCAN_DIRECTORIES` / `SCAN_FILES`** — The only locations ownership is read from (`src`, `scenarios`, `scripts`, plus root tool configs). `tests/` is excluded everywhere.
- **`ALIAS_PREFIXES`** — `tsconfig.json` path aliases (`@modules/`, `@kernel/`, etc.) that must never be treated as external packages.
- **`walk(directory)`** — Recursively lists `.ts/.js` files, skipping `tests/` dirs and `.test.`/`.spec.` files.
- **`ownerOf(file)`** — Maps a file path to a coarse ownership label: `module:<name>` for `src/modules/<name>/`, or `kernel`, `shared-kernel`, `infrastructure`, `scenarios`, `scripts`, `app`.
- **`importSpecifiers(source)`** — Regex-extracts `from "…"` / `require("…")` targets; filters out relative paths and alias prefixes.
- **`packageFor(specifier, packages)`** — Resolves a specifier (possibly a subpath) to a declared package name.
- **`isBuiltin(specifier)`** — True for `node:*` and bare built-in module names.
- **`readOwnership(packages)`** — The main scan loop: for every file, extracts specifiers, resolves to a package, and accumulates a `Map<packageName, Set<owner>>`. Throws `undeclaredImportError` if a specifier resolves in `node_modules` but is absent from `package.json` (the D1 defect).
- **`soleModuleOwner(owners)`** — Returns the module name when the owner set is exactly one `module:*` entry; otherwise `undefined`.
- **`groupRows(packages, groups)`** — Builds one table row per hand-kept group that has at least one matching package.
- **`moduleOwnedRow(packages, groups, ownership)`** — Collects ungrouped packages with a sole module owner into a single "Owned by a module" row.
- **`ungroupedTable(packages, groups, ownership)`** — Renders the leftover "Ungrouped" section (visible, non-fatal).
- **`renderTable(packages, groups, ownership)`** — Assembles the full markdown table for one half (runtime or dev).
- **`apply()`** — Writes both blocks into the page via `applyMarkerBlocks`, or exits non-zero on drift when `--check` is set.

## Relationships

- **`scripts/docs/dependency-groups.ts`** — Direct import. Provides `RUNTIME_GROUPS`, `DEV_GROUPS`, `matchesGroup`, and the `DependencyGroup` type. This is the hand-kept source of group names, match patterns, purpose strings, and "read more" links.
- **`scripts/docs/marker-block.ts`** — Direct import. Provides `applyMarkerBlocks`, the mechanism that inserts generated markdown between the `<!-- dependency-map:*:start/end -->` comment markers in the target page.
- **`src/infrastructure/adapters/cache.ts`** — Indirect: lives under `src/infrastructure/`, so `walk()` includes it and `ownerOf` classifies its imports under the `infrastructure` label. Its import specifiers contribute to the ownership map.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Test in the dependency graph that exercises this script's behavior (likely the `--check` flag or ownership classification). Not itself scanned; `tests/` is excluded from all source walks.

## Notes

- The script deliberately excludes `tests/` and `.test.`/`.spec.` files from the ownership scan. A package imported *only* by test code will appear as "Ungrouped" with an empty "Imported from" column.
- `ALIAS_PREFIXES` must stay in sync with `tsconfig.json` paths. A new alias not listed here will be mistaken for an external package and either fail to resolve or trigger a false `undeclaredImportError`.
- `packageFor` uses a linear `find` over the package list; it matches exact names first, then subpath prefixes. Scopes (`@scope/pkg`) are handled by `packageRootOf` for the `node_modules` existence check.
- The "Ungrouped" section is informational, not a build failure — consistent with the project's "less policing" stance. It does not cause `--check` to exit non-zero.
- `--check` is the mode CI / `complete` uses; running the script without the flag rewrites the page in place.
