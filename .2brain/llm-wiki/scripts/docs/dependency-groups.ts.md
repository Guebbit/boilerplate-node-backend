---
source: scripts/docs/dependency-groups.ts
sha256: 98c498355e730bb80a975f1643e70a1bc3b7c2f9eceb8dea319186ecf95de790
generated_at: 2026-11-14T17:31:18.366894+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/dependency-groups.ts

## Purpose

The hand-curated half of `docs/tools/package-dependencies.md`. It defines *which family* each npm package belongs to, *why* it exists in that family, and where to read more — while leaving the mechanical parts (which packages are actually installed, who imports them) to the auto-generated companion. Without this file, the dependency docs would be a flat, unexplained list.

## Key elements

- **`DependencyGroup`** (interface) — one row of the docs table: `name`, `purpose` (prose), `readMore` (link(s) to other wiki pages), `match` (array of package-name patterns).
- **`RUNTIME_GROUPS`** — 8 families of production dependencies (HTTP core, Security/auth, Persistence, Cache/messaging, Email/rendering/media, Observability, i18n, Declared config).
- **`DEV_GROUPS`** — 12 families of dev-only dependencies (TS toolchain, type defs, testing, deeper testing, linting, architecture, code-shape audit, commit hygiene, contracts/codegen, docs site, maintenance).
- **`matchesGroup(packageName, patterns)`** — returns a boolean: whether `packageName` is named by one of `patterns` (exact match or `prefix*` wildcard, e.g. `@opentelemetry/*`).

## Relationships

- **`scripts/docs/generate-dependency-map.ts`** — the sole consumer. It derives the installed packages and their import graph, then calls `matchesGroup` to bucket each package into a `RUNTIME_GROUPS` or `DEV_GROUPS` entry. Packages that match no group and are imported by >1 module are dumped into an "Ungrouped" table; packages imported by exactly one module are listed under that module instead. This file provides the *semantics*; the generator provides the *facts*.

## Notes

- **Patterns vs. exact names.** Only two families use wildcard patterns (`@opentelemetry/*`, `@types/*`). Everything else is an exact string match — adding a new scoped sub-package (e.g. a new `@eslint/*` plugin) requires an explicit entry.
- **"Ungrouped" is a feature, not a failure.** A package that matches no group and is imported by multiple modules surfaces in the docs page's Ungrouped table. This is intentional: visible beats silent, so contributors notice the gap.
- **Single-import packages are deliberately absent.** If a package is imported by exactly one module and matches no group, the generator lists it under that module. Restating it here would duplicate ownership.
- **Inline comments in `match` arrays** explain *why* a seemingly-unrelated package is grouped there (e.g. `@babel/plugin-transform-modules-commonjs` is babel-jest's one plugin; `@sinonjs/fake-timers` backs both the demo clock and jest fake timers). These are load-bearing context for anyone editing the list.
- **Do not add a package list here.** The generator derives the actual installed packages and their importers. This file only supplies the grouping taxonomy. Duplicating the package roster would drift.
