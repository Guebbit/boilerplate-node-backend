---
source: scripts/docs/dependency-groups.ts
sha256: 576b08bd569e6acd73f5e46b1f530f536a8b40b5fe84e4929024595a603f2b44
generated_at: 2026-11-08T02:46:41.902498+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/dependency-groups.ts

## Purpose

The hand-maintained half of `docs/tools/package-dependencies.md`. It classifies npm packages into named families (with a purpose blurb and a "read more" link) so the generated dependency map can render grouped tables. The other half of that page—which packages exist and who imports them—is computed by the generator, not stored here.

## Key elements

- **`DependencyGroup`** (interface) — one family entry: `name`, `purpose`, `readMore`, and `match` (list of exact names or `prefix*` patterns).
- **`RUNTIME_GROUPS`** — 8 families for production dependencies (HTTP core, Security/auth, Persistence, Cache/messaging, Email/rendering, Observability, i18n, Declared config).
- **`DEV_GROUPS`** — 11 families for devDependencies (TS toolchain, type defs, testing, deeper testing, linting, architecture, code-shape audit, commit hygiene, contracts/codegen, docs site, maintenance).
- **`matchesGroup(packageName, patterns)`** — returns `true` if `packageName` equals an exact pattern or starts with a `prefix*` pattern (strips the trailing `*`).

## Relationships

- **`scripts/docs/generate-dependency-map.ts`** — consumes `RUNTIME_GROUPS`, `DEV_GROUPS`, and `matchesGroup` to classify every package in `package.json` into a group table. Packages matching no group and imported by >1 module land in an "Ungrouped" table; packages imported by exactly one module are listed under that module instead. This file is the sole source of group names, purposes, and links; the generator never hard-codes them.

## Notes

- Matching is **first-listed-wins** per group array, but a package can only land in one group because the generator iterates groups in order. Patterns like `@opentelemetry/*` match any package starting with `@opentelemetry/`.
- Unmatched, multi-importer packages do **not** fail the build; they surface in an "Ungrouped" table ("visible beats silent"). Unmatched single-importer packages are intentionally omitted from this file's scope.
- The `readMore` field is a Markdown link (or `—` when there is no dedicated doc). It is rendered verbatim into the generated page.
- `mongodb` is listed under Persistence with the note that it is imported only as a type (version pin for `mongoose`'s `.connection.db`); this is a classification decision, not a runtime dependency assertion.
