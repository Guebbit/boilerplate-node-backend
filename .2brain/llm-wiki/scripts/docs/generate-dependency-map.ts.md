---
source: scripts/docs/generate-dependency-map.ts
source_sha256: 1f6e06258fe11b91c0c274b9c80b69fe9d6f9adf43a82b3342fa4e981743ab0b
context_sha256: 6d02a8feb42bc18df986c203af211da75fc7c078eb5695eb261377158d0fb0db
generated_at: 2026-11-22T02:02:54.648675+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/generate-dependency-map.ts

## Purpose

A `tsx` script that generates the two tables in the package-dependencies reference page under `docs/reference/`: every `package.json` dependency grouped by purpose, and, for packages no hand-kept group claims, the single module that imports it. It rewrites only the marker-delimited blocks, leaves the surrounding prose alone, and supports `--check` (used by `complete`) to report drift instead of writing.

## Key elements

- `checkOnly`: `hasFlag('check')`; drift-report mode.
- `PAGE`, `RUNTIME_START/END`, `DEV_START/END`: target page and the `<!-- dependency-map:runtime|dev:start|end -->` markers.
- `SCAN_DIRECTORIES` (`src`, `scenarios`, `scripts`) and `SCAN_FILES` (root tool configs such as `eslint.config.ts`, `orval.config.ts`, the jest configs and `.dependency-cruiser.cjs`): where imports are read from. `tests/` is excluded.
- `ALIAS_PREFIXES`: tsconfig path aliases (`@modules/`, `@kernel/`, …) that are never treated as packages.
- `PackageManifest` / `readManifest()`: reads `dependencies` and `devDependencies` names from `package.json`.
- `walk()`: recursively lists source files, skipping `tests/` folders and `.test.`/`.spec.` files.
- `ownerOf()`: coarsens a file path to an owner: `module:<name>` (only under `src/modules/<name>/`), `kernel`, `domain-primitives`, `infrastructure`, `scenarios`, `scripts`, or `app`.
- `importSpecifiers()`: regex-extracts `from "x"` / `require("x")` targets, dropping relative and aliased paths.
- `packageFor()`, `isBuiltin()`, `packageRootOf()`: resolve a specifier to a declared package, detect Node built-ins, and get the installable root name (`@scope/pkg` kept whole).
- `undeclaredImportError()`: builds the error for an import that `node_modules` resolves but `package.json` doesn't declare.
- `readOwnership()`: maps each declared package to the set of owners importing it. Throws on undeclared imports.
- `soleModuleOwner()`: returns the module name when a package has exactly one importer and it is a module.
- `Row`: table row shape (`group`, `packages`, `purpose`, `readMore`).
- `groupRows()`: rows for hand-kept groups that have at least one present package.
- `moduleOwnedRow()`: one "Owned by a module" row for ungrouped packages with a sole module owner, sorted by module then package, linking to `../modules/<module>.md`.
- `ungroupedTable()`: an "### Ungrouped" table (Package / Imported from) for packages with no group and no sole module owner. It returns `''` when none exist.
- The rest of the file (block rendering and writing) is not shown here.

## Relationships

- `scripts/docs/dependency-groups.ts`: supplies `DEV_GROUPS`, `RUNTIME_GROUPS`, `matchesGroup` and the `DependencyGroup` type. These are the hand-kept groups and purposes.
- `scripts/docs/marker-block.ts`: supplies `applyMarkerBlocks`, which rewrites the marker blocks in the page.
- `scripts/modules-on-disk.ts`: supplies `REPO_ROOT`, used as `ROOT`.
- `scripts/cli.ts`: supplies `hasFlag` for `--check`.
- `scripts/fail-script.ts`: supplies `failScript`, imported for failure reporting.

## Notes

- Ownership is derived, not hand-kept. Only a package's group and purpose live in `dependency-groups.ts`.
- Packages with no group and no single owner land in "Ungrouped". This is visible but deliberately not a build failure ("less policing").
- Importing a package that exists in `node_modules` but isn't declared in `package.json` throws. It usually works only because another dependency pulls it in transitively.
- Import detection is regex-based, not AST-based. It matches `from "…"` and `require("…")` only.
- Ownership is only distinguished at module level. Everything else collapses into shared areas, so a package imported from two areas is never "owned by a module".
