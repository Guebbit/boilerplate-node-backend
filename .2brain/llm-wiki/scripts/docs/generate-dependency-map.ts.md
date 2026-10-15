---
source: scripts/docs/generate-dependency-map.ts
sha256: 851f9f6844b18e7b8174fcb56266d138647cc2647fea8e05a770ac0adeab0bbd
generated_at: 2026-10-15T09:40:12.542654+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-dependency-map.ts

## Purpose

Generates (or verifies) the two dependency tables in `docs/tools/package-dependencies.md`. It reads the package list from `package.json`, scans production source to determine which module or shared area imports each package, and writes the results between HTML-comment marker blocks in the page. In `--check` mode (used by `complete`) it reports drift without writing. The script exists so that ownership and the package list are always derived from source rather than hand-maintained.

## Key elements

- **`apply()`** — entry point; reads the manifest, computes ownership, renders both tables, and writes them into `PAGE` (or reports drift when `--check` is set).
- **`readOwnership(packages)`** — walks `SCAN_DIRECTORIES` + `SCAN_FILES`, extracts import specifiers from each file, and builds a `Map<packageName, Set<ownerArea>>`. Throws `undeclaredImportError` if a specifier resolves in `node_modules` but is absent from `package.json`.
- **`ownerOf(file)`** — coarsens a file path to an ownership label: `module:<name>` for `src/modules/<name>/**`, or `kernel` / `shared-kernel` / `infrastructure` / `scenarios` / `scripts` / `app`.
- **`soleModuleOwner(owners)`** — returns the module name if the owner set has exactly one entry and it is a `module:` entry.
- **`groupRows` / `moduleOwnedRow` / `ungroupedTable`** — build the three tiers of each table: hand-kept groups, single-module-owned packages, and the "Ungrouped" leftover.
- **`renderTable`** — assembles header, group rows, module-owned row, and ungrouped section into one markdown block.
- **`importSpecifiers(source)`** — regex-extracts `from "…"` / `require("…")` targets, filtering out relative paths and tsconfig alias prefixes.
- **`isBuiltin` / `BUILTIN_MODULES`** — excludes Node built-in modules from the ownership scan.
- **Marker constants** (`RUNTIME_START`, `DEV_START`, etc.) — delimit the generated blocks inside the markdown page.

## Relationships

- **`scripts/docs/dependency-groups.ts`** — imported for `RUNTIME_GROUPS`, `DEV_GROUPS`, `matchesGroup`, and the `DependencyGroup` type. This is the hand-kept source of group names, match patterns, and purpose strings.
- **`scripts/docs/marker-block.ts`** — imported for `applyMarkerBlocks`, which inserts or replaces content between the HTML-comment markers in the target page without touching surrounding prose.
- **`scripts/modules-on-disk.ts`** — imported for `REPO_ROOT`, the canonical repository root used to resolve all file paths.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises this script's behaviour (drift detection, `--check` exit code) as part of the CI mutation-wave test suite.

## Notes

- `tests/` directories and `*.test.*` / `*.spec.*` files are excluded from the ownership scan everywhere; test-only imports do not count as production ownership.
- A package that no hand-group claims and that exactly one `src/modules/<name>/` imports is listed automatically under "Owned by a module" — no entry needed in `dependency-groups.ts`.
- Packages with no group and no single owner land in the "Ungrouped" section: visible but **not** a build failure, per the "less policing" stance in `docs/theory/modules.md`.
- The D1 guard: if a specifier resolves in `node_modules` but is missing from `package.json`, the script throws rather than silently attributing ownership. This catches phantom transitive dependencies.
- tsconfig path aliases (`@app/`, `@kernel/`, `@modules/`, etc.) are explicitly excluded so they are never mistaken for npm packages.
- The script mirrors the structure of `generate-role-matrix.ts`: same marker-block pattern, same `--check` contract with `complete`.
