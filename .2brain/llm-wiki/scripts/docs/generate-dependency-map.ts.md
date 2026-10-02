---
source: scripts/docs/generate-dependency-map.ts
sha256: f3abc61f623d7a8b193838f46249ea948414ccbf83d874bab595a17a25be3fe8
generated_at: 2026-10-01T12:29:48.781631+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-dependency-map.ts

## Purpose

Generates the two dependency tables (Runtime and Dev) in `docs/tools/package-dependencies.md` by reading `package.json`, scanning production source files for import specifiers, and cross-referencing hand-kept group assignments. It runs in write mode (default) or `--check` mode (CI / `complete`), where it reports drift without modifying the page. The script exists to keep the published package list and ownership mapping accurate automatically—eliminating the stale hand-written tables that previously missed 32 of 99 packages.

## Key elements

- **`apply()`** — Entry point. Reads `package.json`, builds the ownership map, renders both tables, and either writes them into the page via marker blocks or reports drift (`--check`).
- **`readOwnership(packages)`** — Walks `SCAN_DIRECTORIES` (`src`, `scenarios`, `scripts`) and `SCAN_FILES` (root tool configs), extracts external import specifiers, and builds a `Map<packageName, Set<ownerArea>>`. Throws an `undeclaredImportError` for any package resolved in `node_modules` but missing from `package.json`.
- **`ownerOf(file)`** — Coarsens a file path to its ownership tier: `module:<name>` (for `src/modules/<name>/`), `kernel`, `infrastructure`, `scenarios`, `scripts`, or `app`.
- **`importSpecifiers(source)`** — Regex-extracts `from "…"` / `require("…")` targets, filtering out relative paths and tsconfig path aliases (`@modules/`, `@kernel/`, etc.).
- **`groupRows()` / `moduleOwnedRow()` / `ungroupedTable()`** — Build the three table sections: hand-kept groups, single-module-owned packages, and the "Ungrouped" catch-all.
- **`ALIAS_PREFIXES`** — Lists tsconfig path aliases that must never be mistaken for npm packages.
- **`checkOnly`** — Set when `--check` is in `process.argv`; flips `apply()` into report-only mode.

## Relationships

- **`scripts/docs/dependency-groups.ts`** — Imported for `RUNTIME_GROUPS`, `DEV_GROUPS`, `matchesGroup`, and the `DependencyGroup` type. This file is the single source of hand-kept group names, match patterns, purposes, and "read more" links.
- **`scripts/docs/marker-block.ts`** — Imported for `applyMarkerBlocks`, which inserts the rendered table text between the `dependency-map:runtime|dev:start/end` HTML-comment markers in the target page without touching surrounding prose.
- **`src/infrastructure/adapters/cache.ts`** — A scanned source file (lives under `src/infrastructure/`). Its import specifiers are read by `readOwnership` to attribute packages to the `infrastructure` owner tier.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Exercises the CI-wave behaviour of the `--check` path (drift reporting rather than rewriting). The script itself excludes `tests/` from its ownership scan, so this file is a consumer, not a data source.

## Notes

- `tests/` directories and `*.test.*` / `*.spec.*` files are **excluded** from the ownership scan everywhere. Ownership is decided only on production code.
- A package is "module-owned" only when exactly **one** `src/modules/<name>/` directory imports it and no other area does. Shared imports (two+ owners, or any non-module owner) fall through to Ungrouped.
- The `--check` flag is the mode used by `complete`; it must exit non-zero on drift.
- `package.json` versions are irrelevant here—only the **names** in `dependencies` and `devDependencies` are read.
- The script hard-fails (throws) on any import that resolves in `node_modules` but is absent from `package.json`, surfacing the "transitive dependency leak" defect immediately rather than silently listing it.
