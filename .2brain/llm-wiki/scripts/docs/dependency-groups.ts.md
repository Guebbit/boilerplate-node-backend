---
source: scripts/docs/dependency-groups.ts
source_sha256: 67201ef25bfc229f7b356d0766c3127f16f83d9d9f48c6fbf0f22d79c2ac7c2c
context_sha256: 13284e95a708187dfbfeb85b2b8eee1dc709608b99af0c0d93733832119490b1
generated_at: 2026-11-22T02:02:04.766679+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/dependency-groups.ts

## Purpose
The hand-maintained half of the package-dependencies reference page: it declares which family each npm package belongs to, why it's there, and where to read more. Everything else on that page (which packages exist, who imports each) is derived by `generate-dependency-map.ts`, so it is not duplicated here.

## Key elements
- `DependencyGroup` (interface): `name` (table heading), `purpose` (one-line description), `readMore` (docs link), `match` (exact package names or `prefix*` globs).
- `RUNTIME_GROUPS`: families for code that runs in production: HTTP core, Security and auth, Persistence, Cache and messaging, Email/rendering/media, Observability, i18n, Declared config.
- `DEV_GROUPS`: build, lint, test and docs tooling that is never shipped: TypeScript toolchain, Type definitions, Testing, Deeper testing, Linting and formatting, Architecture, Code-shape audit, Commit hygiene, Contracts and codegen, Docs site, Maintenance.
- `matchesGroup(packageName, patterns)`: returns true if the name equals a pattern exactly, or starts with the prefix of a pattern ending in `*`.

## Relationships
`generate-dependency-map.ts` is the companion script. It derives the package and importer data, and this file supplies the grouping and rationale text. The comments here describe how the generator treats unmatched packages (see Notes).

## Notes
- Matching is only exact name or trailing `*` prefix. There are no other glob forms.
- A package that matches no group and is imported by more than one module appears in the page's "Ungrouped" table. It does not fail anything.
- A package that matches no group and is imported by exactly one module is deliberately left out of these lists. The generator lists it under that module.
- Some entries are narrow on purpose, and their `purpose` text says why. For example, `mongodb` is imported only as a type, and `tsx` is a runtime dependency because production runs the TS entrypoints directly.
- Several `readMore` values are `'—'` where no docs page exists.
- The file has a `#!/usr/bin/env tsx` shebang but only exports data and one helper.
