---
source: scripts/docs/dependency-groups.ts
sha256: 53242ad3a5e2f29d320630910eab5acaf541d3948a3805386969dca6c436f9d9
generated_at: 2026-09-23T17:25:03.833037+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/dependency-groups.ts

## Purpose

The hand-kept half of `docs/tools/package-dependencies.md`. It defines the semantic grouping of npm packages — which family each belongs to, what it's for, and where to read more — while the other half (which packages exist and who imports them) is derived at generation time by `generate-dependency-map.ts`. Keeping only the classification here avoids the drift that would come from also hand-listing package inventories.

## Key elements

- **`DependencyGroup`** (interface) — shape of one family: `name`, `purpose`, `readMore` (a Markdown link), and `match` (an array of package-name patterns).
- **`RUNTIME_GROUPS`** — seven families covering packages that execute in production: HTTP core, Security/auth, Persistence, Cache & messaging, Email/rendering/media, Observability, i18n.
- **`DEV_GROUPS`** — ten families covering build, test, lint, docs, and maintenance tooling that never ships.
- **`matchesGroup(packageName, patterns)`** — returns `true` if `packageName` is an exact match or a prefix match (`prefix*` → `startsWith(prefix)`).

## Relationships

- **`scripts/docs/generate-dependency-map.ts`** — the consumer. It imports `RUNTIME_GROUPS`, `DEV_GROUPS`, and `matchesGroup` to classify each dependency and render the full `package-dependencies.md` page. Packages that match no group and are imported by more than one module are placed in an "Ungrouped" table; packages matching no group but imported by exactly one module are intentionally omitted (the generator lists them under that module instead).
- **`CLAUDE.md`** — the project-level agent instructions file that references this script's doc page as part of the repository's documentation conventions.

## Notes

- `match` entries are either exact names (`'express'`) or prefix patterns ending in `*` (`'@opentelemetry/*'`, `'@types/*'`). Matching is case-sensitive and done via `startsWith` for patterns, `===` for exact names.
- A package that matches no group and is imported by **more than one** module is not an error — it surfaces in the generated "Ungrouped" table. A package matching no group and imported by **exactly one** module is left out on purpose; the generator attributes it to that module.
- `readMore` values are relative Markdown links (e.g. `[Security](./security.md)`) or the literal string `'—'` when no dedicated page exists.
- The file is a data + one-helper module; it has no side effects and no I/O.
