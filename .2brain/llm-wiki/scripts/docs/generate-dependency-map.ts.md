---
source: scripts/docs/generate-dependency-map.ts
sha256: 3c0f5d204dfdf28132f6d2f99bcddaf15011939b50ad9b21a11d1782ddf4a085
generated_at: 2026-10-29T01:34:22.644963+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-dependency-map.ts

## Purpose

Generates (or validates with `--check`) the two dependency tables in `docs/tools/package-dependencies.md`. It scans production source to determine which package each module imports, groups them via the hand-kept categories in `dependency-groups.ts`, auto-assigns packages whose sole importer is a single `src/modules/<name>/` directory, and surfaces everything else as "Ungrouped." It also hard-fails on any import that `node_modules` resolves but `package.json` never declared.

## Key elements

- **`checkOnly`** — boolean from `hasFlag('check')`; when true, the script reports drift instead of rewriting the page.
- **`SCAN_DIRECTORIES` / `SCAN_FILES`** — the only locations ownership is read from: `src/`, `scenarios/`, `scripts/`, plus six root tool configs (eslint, orval, jest ×3, dependency-cruiser).
- **`ALIAS_PREFIXES`** — tsconfig path aliases (`@api/`, `@modules/`, etc.) filtered out so they are never mistaken for npm packages.
- **`walk(directory)`** — recursive file listing that skips `tests/` folders and `.test.`/`.spec.` files.
- **`ownerOf(file)`** — maps a source file to a coarse ownership tier (`module:<name>`, `kernel`, `infrastructure`, `scenarios`, `scripts`, `app`).
- **`importSpecifiers(source)`** — regex extraction of all external `from`/`require` specifiers in a file.
- **`readOwnership(packages)`** — walks every scanned file and builds a `Map<packageName, Set<owner>>`; throws `undeclaredImportError` if a specifier resolves in `node_modules` but is absent from `package.json`.
- **`soleModuleOwner(owners)`** — returns the module name only when the owner set has exactly one `module:*` entry.
- **`groupRows` / `moduleOwnedRow` / `ungroupedTable`** — build the three tiers of the rendered table: hand-kept groups, single-module-owned packages, and the leftover "Ungrouped" section.
- **`renderTable(packages, groups, ownership)`** — assembles one table half (Runtime or Dev).
- **`apply`** *(truncated in source)* — writes or checks both marker-delimited blocks in the target page via `applyMarkerBlocks`.

## Relationships

- **`scripts/docs/dependency-groups.ts`** — provides `RUNTIME_GROUPS`, `DEV_GROUPS`, `matchesGroup`, and the `DependencyGroup` type; the single source of hand-kept group names, match patterns, purposes, and "read more" links.
- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, which splices generated content between the `<!-- dependency-map:… -->` markers in the markdown page (or reports drift in `--check` mode).
- **`scripts/modules-on-disk.ts`** — exports `REPO_ROOT`, imported as `ROOT` to anchor all filesystem paths.
- **`scripts/cli.ts`** — exports `hasFlag`, used to detect the `--check` flag.
- **`scripts/fail-script.ts`** — exports `failScript`, the standard error-exit helper.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI test that exercises this script's generation/check behavior as part of the mutation-wave suite.

## Notes

- **Undeclared-import guard:** if a specifier is absent from `package.json` but a directory exists under `node_modules/`, the script throws with a D1-defect message. This means the script doubles as a lint: a package that works only by transitive luck will break the build.
- **Ownership granularity:** only `src/modules/<name>/` is fine enough to name a single owner. Files under `src/kernel/`, `src/infrastructure/`, etc. are grouped at the area level, so a package imported by both a module and the kernel has *no* sole owner and falls through to Ungrouped.
- **Ungrouped is not fatal:** per `docs/theory/modules.md`'s "less policing" stance, ungrouped packages render in the page but do not fail the build.
- **`--check` is the CI path:** the `complete` command invokes the script with `--check` so it reports drift without mutating the file.
