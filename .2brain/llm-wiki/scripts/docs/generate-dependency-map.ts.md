---
source: scripts/docs/generate-dependency-map.ts
sha256: 3c0f5d204dfdf28132f6d2f99bcddaf15011939b50ad9b21a11d1782ddf4a085
generated_at: 2026-11-08T02:47:27.818993+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-dependency-map.ts

## Purpose

Generates (or validates) the two dependency tables in `docs/tools/package-dependencies.md`: every `package.json` dependency grouped by purpose, with derived ownership (which module imports it) for packages no hand-kept group claims. Runs in `--check` mode to report drift or in write mode to rewrite the page. Exists to replace a hand-written page that had missed 32 of 99 packages and listed 3 that no longer existed.

## Key elements

- **`readManifest()`** — Reads `package.json`, returns the `dependencies` and `devDependencies` name maps.
- **`walk(directory)`** — Recursively lists source files, skipping any `tests/` folder and `.test.`/`.spec.` files.
- **`ownerOf(file)`** — Coarsens a file path to an ownership tier: `module:<name>` for `src/modules/<name>/**`, or `kernel`, `infrastructure`, `scenarios`, `scripts`, `app`.
- **`importSpecifiers(source)`** — Regex-extracts all `from "…"` / `require("…")` targets; filters out relative paths and `tsconfig` aliases.
- **`packageFor(specifier, packages)`** — Resolves an import specifier (possibly a subpath) to a top-level package name.
- **`readOwnership(packages)`** — Walks all scan targets, builds a `Map<package, Set<owner>>`; **throws** on any specifier that resolves in `node_modules` but is absent from `package.json` (the D1 undeclared-import defect).
- **`soleModuleOwner(owners)`** — Returns the module name if exactly one `module:*` owner exists, else `undefined`.
- **`groupRows(packages, groups)`** — Builds table rows from the hand-kept `RUNTIME_GROUPS`/`DEV_GROUPS`, filtering to groups that actually have a present package.
- **`moduleOwnedRow(…)`** — Produces the single "Owned by a module" row for packages unclaimed by a group but imported by exactly one module.
- **`ungroupedTable(…)`** — Renders the "Ungrouped" section for packages with neither a group nor a single owner; informational, not a failure.
- **`renderTable(…)`** — Assembles the full markdown table (group rows + module-owned row + ungrouped section) for one half of the page.
- **`apply()`** *(truncated)* — Writes both generated blocks into `PAGE` via marker comments, or reports drift in `--check` mode.
- **Constants** — `SCAN_DIRECTORIES` (`src`, `scenarios`, `scripts`), `SCAN_FILES` (root tool configs), `ALIAS_PREFIXES` (tsconfig path aliases), marker comment strings.

## Relationships

- **`scripts/cli.ts`** — Imports `hasFlag` to detect the `--check` flag.
- **`scripts/docs/dependency-groups.ts`** — Imports `RUNTIME_GROUPS`, `DEV_GROUPS`, `matchesGroup`, and the `DependencyGroup` type; the hand-kept group definitions and matchers live there.
- **`scripts/docs/marker-block.ts`** — Imports `applyMarkerBlocks` to splice generated content into the target page between marker comments.
- **`scripts/fail-script.ts`** — Imports `failScript` for process-level error reporting.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` as the canonical repo root path.

## Notes

- `tests/` is excluded from ownership scanning throughout — a test-only import never counts as ownership.
- Undeclared imports (present in `node_modules`, absent from `package.json`) are a **hard throw**, not a warning. The error message includes the importing file and the offending specifier.
- The "Ungrouped" section is deliberately non-blocking: per `docs/theory/modules.md`'s "less policing" stance, leftovers are visible in the page but do not fail the build.
- Uses the same marker-block pattern as `generate-role-matrix.ts`: prose outside the markers is untouched; only the content between start/end markers is regenerated.
- `ALIAS_PREFIXES` must stay in sync with `tsconfig.json` path aliases; a new alias not listed here will be misclassified as an external package.
