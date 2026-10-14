---
source: scripts/docs/dependency-groups.ts
sha256: 9051c64d80715a48f570c4a105f198fa4f67d5df4437f26bb3af1f153ba45709
generated_at: 2026-10-14T07:14:13.939403+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/dependency-groups.ts

## Purpose

The hand-kept half of `docs/tools/package-dependencies.md`. It declares which family (group) each npm package belongs to and *why* it exists in the project. The rest of that page — which packages are actually installed and who imports them — is derived at generation time by `generate-dependency-map.ts`; keeping it out of this file avoids drift.

## Key elements

- **`DependencyGroup`** — interface with `name`, `purpose`, `readMore` (a Markdown link), and `match` (array of package-name patterns).
- **`RUNTIME_GROUPS`** — array of 8 groups covering production-code families: HTTP core, Security & auth, Persistence, Cache & messaging, Email/rendering/media, Observability, i18n, Declared config.
- **`DEV_GROUPS`** — array of 11 groups covering tooling families: TS toolchain, type defs, Testing, Deeper testing, Lint/format, Architecture, Code-shape audit, Commit hygiene, Contracts & codegen, Docs site, Maintenance.
- **`matchesGroup(packageName, patterns)`** — returns `true` if the name equals an exact pattern or starts with a `prefix*` pattern (e.g. `@opentelemetry/*`, `@types/*`).

## Relationships

- **`scripts/docs/generate-dependency-map.ts`** — imports `RUNTIME_GROUPS`, `DEV_GROUPS`, and `matchesGroup` to classify each installed package into a group when rendering the dependency-map page. Packages that match no group and are imported by more than one module are placed in an "Ungrouped" table; packages imported by exactly one module and ungrouped are listed under that module instead.

## Notes

- **Pattern syntax**: a trailing `*` in a `match` entry means prefix match (`pattern.slice(0, -1)`); everything else is an exact string comparison. Order in the array is significant — first match wins.
- **No group ≠ error**: an ungrouped, multi-import package surfaces in the "Ungrouped" table rather than failing the build. The design favours visibility over strictness.
- **Single-import packages**: intentionally excluded from the hand-kept table; the generator attaches them to their sole importing module, which is the only ownership fact a group table would restate.
- **`readMore` values** are relative Markdown links into sibling docs (e.g. `./runtime.md`, `./security.md`). A dash (`—`) means no dedicated page exists.
- The file is executed with `tsx` (see shebang) but is consumed as a module, not as a standalone script.
