---
source: scripts/docs/generate-dependency-map.ts
sha256: b97d1e0ff3bbc9528de02cf9eeacc5f3be1ffc4faee2c35f36e42d78ddcaa201
generated_at: 2026-11-14T17:32:27.383680+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-dependency-map.ts

## Purpose

Generates the two dependency tables (runtime and dev) embedded in `docs/tools/package-dependencies.md`. It reads every `package.json` dependency, scans production source to determine who imports each package, groups them by the hand-kept categories in `dependency-groups.ts`, and auto-assigns ungrouped packages that have a single module owner. Runs in write mode or `--check` mode (for CI drift detection) and inserts its output between HTML-comment markers in the page, leaving surrounding prose untouched.

## Key elements

- **`checkOnly`** — boolean derived from `--check` flag; when true, the script reports drift instead of rewriting.
- **`SCAN_DIRECTORIES` / `SCAN_FILES`** — the only places ownership is read from: `src/`, `scenarios/`, `scripts/`, plus six root tool-config files. `tests/` is excluded everywhere.
- **`ALIAS_PREFIXES`** — tsconfig path aliases (`@modules/`, `@kernel/`, …) that must never be mistaken for external packages.
- **`walk(directory)`** — recursive file walker that skips `tests/` folders and `*.test.*`/`*.spec.*` files.
- **`ownerOf(file)`** — coarsens a file path to an ownership tier: `module:<name>` for `src/modules/<name>/`, otherwise `kernel`, `infrastructure`, `domain-primitives`, `scenarios`, `scripts`, or `app`.
- **`importSpecifiers(source)`** — extracts external `from`/`require` targets, filtering out relative paths, aliases, and builtins.
- **`packageFor(specifier, packages)`** — resolves a specifier to a known package name (exact match or subpath like `pkg/sub`).
- **`isBuiltin(specifier)`** — guards against treating Node builtins (`node:fs`, bare `fs`, …) as external dependencies.
- **`undeclaredImportError(specifier, file)`** — throws if an import resolves in `node_modules` but is absent from `package.json` (the D1 defect: phantom transitive dependency).
- **`readOwnership(packages)`** — main scan loop: builds a `Map<packageName, Set<owner>>` across all scanned files.
- **`soleModuleOwner(owners)`** — returns the module name only if the sole owner is a `module:*` entry.
- **`groupRows(packages, groups)`** — one table row per hand-kept group that has at least one present package.
- **`moduleOwnedRow(…)`** — the "Owned by a module" row for packages no group claims but exactly one module imports.
- **`ungroupedTable(…)`** — renders leftover packages (no group, no single owner) under an "Ungrouped" heading; visible but not a build failure.
- **`renderTable(…)`** — assembles one half (runtime or dev) as a Markdown table.
- **Marker constants** (`RUNTIME_START`, `RUNTIME_END`, `DEV_START`, `DEV_END`) — HTML-comment delimiters placed in the Markdown page; `applyMarkerBlocks` replaces content between them.

## Relationships

- **`scripts/cli.ts`** — provides `hasFlag`, used to detect `--check`.
- **`scripts/docs/dependency-groups.ts`** — source of all hand-kept grouping data: `RUNTIME_GROUPS`, `DEV_GROUPS`, `matchesGroup`, and the `DependencyGroup` type. Adding a new group there is the primary way to move a package out of "Ungrouped."
- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, the mechanism that splices generated tables into the page between marker comments while preserving surrounding prose.
- **`scripts/fail-script.ts`** — provides `failScript`, the standard error-exit path (used when the page file is missing or markers are malformed).
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, the canonical repository root path used to construct absolute file paths throughout this script.
- **`src/infrastructure/adapters/cache.ts`** — lives under `src/infrastructure/`, one of the scanned directories; its imports are read by `readOwnership` to determine package ownership for the `infrastructure` tier.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises the CI pipeline that invokes this script in `--check` mode; not itself scanned (it is under `tests/`).

## Notes

- The script throws (not warns) when it finds an import that `node_modules` resolves but `package.json` does not declare — this is the D1 guard. Fix by adding the package to `dependencies` or `devDependencies`.
- "Ungrouped" is intentionally non-fatal: per `docs/theory/modules.md`'s "less policing" stance, an unclaimed package is surfaced for visibility but does not break the build.
- Ownership is decided at the coarsest useful tier. Only `src/modules/<name>/` is fine enough to name a single owner; everything else (kernel, infrastructure, etc.) is a shared area and never produces a "sole owner."
- The scan excludes `tests/` everywhere. A package imported *only* by test code will appear as ungrouped with no owner, which is the intended signal that it has no production justification yet.
