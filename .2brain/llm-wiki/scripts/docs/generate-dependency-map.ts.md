---
source: scripts/docs/generate-dependency-map.ts
sha256: 6e94c1cf2071e5e85dac390c3555a26d2e1655bd5bfacfe5b31756ed2ac78917
generated_at: 2026-09-23T17:25:19.483730+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-dependency-map.ts

## Purpose

Generates (or checks) the two dependency tables in `docs/tools/package-dependencies.md` by combining hand-kept group definitions with an automated scan of production source files. It ensures the published package list is always in sync with `package.json` and actual import sites, and flags undeclared dependencies that only resolve transitively.

## Key elements

- **`checkOnly`** — flags `--check` mode: reports drift instead of rewriting the page (used by `complete`).
- **`SCAN_DIRECTORIES` / `SCAN_FILES`** — the only places ownership is read from: `src/`, `scenarios/`, `scripts/`, plus root tool configs (eslint, orval, jest, dependency-cruiser). `tests/` and `*.test.*`/`*.spec.*` files are always excluded.
- **`ALIAS_PREFIXES`** — tsconfig path aliases (`@modules/`, `@kernel/`, etc.) that must never be mistaken for package names.
- **`walk(directory)`** — recursive file listing, skipping `tests/` dirs and test files.
- **`ownerOf(file)`** — maps a file to a coarse ownership label (`module:<name>`, `kernel`, `infrastructure`, `scenarios`, `scripts`, `app`).
- **`importSpecifiers(source)`** — extracts external package specifiers from `from "…"` / `require("…")`, filtering out relatives and aliases.
- **`packageFor(specifier, packages)`** — resolves a specifier to its `package.json` name (exact or subpath).
- **`isBuiltin(specifier)`** — skips `node:`-prefixed and bare Node builtins.
- **`undeclaredImportError(specifier, file)`** — throws if a specifier resolves in `node_modules` but is absent from `package.json` (the "D1 defect").
- **`readOwnership(packages)`** — scans all production files, builds a `Map<packageName, Set<owner>>`.
- **`soleModuleOwner(owners)`** — returns the module name only when exactly one `module:<name>` imports the package.
- **`groupRows` / `moduleOwnedRow` / `ungroupedTable`** — build the three table sections: hand-kept groups, single-module-owned packages, and ungrouped leftovers.
- **`renderTable(packages, groups, ownership)`** — assembles one half (Runtime or Dev) of the page.
- **`apply()`** — writes both marked blocks into `package-dependencies.md` (or exits non-zero on drift in `--check` mode), formatting via `prettier`.

## Relationships

- **`scripts/docs/dependency-groups.ts`** — sole source of hand-kept classification: `DEV_GROUPS`, `RUNTIME_GROUPS`, the `matchesGroup` predicate, and the `DependencyGroup` type. A package not claimed by any group falls through to the ownership or "Ungrouped" logic here.
- **`src/infrastructure/adapters/cache.ts`** — a production file under `src/infrastructure/`; this script reads it during the ownership scan to discover which packages it imports, attributing them to the `infrastructure` owner label.

## Notes

- The script is idempotent: it only rewrites content between the `<!-- dependency-map:*:start/end -->` markers; surrounding prose is untouched.
- A package with no group and exactly one `src/modules/<name>/` importer is listed automatically under that module — no entry in `dependency-groups.ts` needed.
- Anything with no group _and_ no single owner lands in an "Ungrouped" table: visible in the doc but **not** a build failure (per the "less policing" stance in `docs/theory/modules.md`).
- Undeclared dependencies (resolvable in `node_modules` but missing from `package.json`) are a **hard error**, not a warning.
- The script uses `tsx` (see shebang) and imports `prettier` directly; it is not run under `ts-node`.
