---
source: scripts/docs/dependency-groups.ts
sha256: d85cd9bb81a2d67aba9f1eb0cc8ae32aa79cadb370b053aa7882f699e14d34a2
generated_at: 2026-10-29T01:33:43.469258+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/dependency-groups.ts

## Purpose

Defines the hand-maintained half of `docs/tools/package-dependencies.md`: which family each npm package belongs to, what that family does, and where to read more. The other half of that page — the actual package list and per-module import graph — is derived by the generator and kept out of this file to prevent drift.

## Key elements

- **`DependencyGroup`** (interface) — shape of one group entry: `name`, `purpose`, `readMore`, `match` (array of package-name patterns).
- **`RUNTIME_GROUPS`** (const array) — eight families of production packages (HTTP core, Security/auth, Persistence, Cache/messaging, Email/rendering/media, Observability, i18n, Declared config), each with a prose purpose and `readMore` links into the docs tree.
- **`DEV_GROUPS`** (const array) — eleven families of tooling packages (TS toolchain, type defs, testing, deeper testing, linting, architecture, code-shape audit, commit hygiene, contracts/codegen, docs site, maintenance).
- **`matchesGroup(packageName, patterns)`** (exported function) — returns `true` if the name equals a pattern or matches a `prefix*` wildcard (e.g. `@opentelemetry/*`).

## Relationships

- **`scripts/docs/generate-dependency-map.ts`** — consumes `RUNTIME_GROUPS`, `DEV_GROUPS`, and `matchesGroup` to build the full `docs/tools/package-dependencies.md` page. That file owns the "which packages exist / who imports them" data; this file owns only the grouping taxonomy.

## Notes

- Matching is **patterns-first**: `prefix*` entries (e.g. `@types/*`, `@opentelemetry/*`) are checked before exact names. No glob or regex is used.
- A package matching no group **and** imported by more than one module is surfaced in an "Ungrouped" table on the generated page rather than causing an error.
- A package matching no group **and** imported by exactly one module is intentionally omitted from the group tables — the generator lists it under that module, making a hand-kept row redundant.
- Inline comments inside the arrays document *why* a less-obvious package sits in its group (e.g. `babel-jest`'s CJS downleveling role, `@sinonjs/fake-timers` shared between the demo clock and Jest). These comments are the only place that rationale lives.
