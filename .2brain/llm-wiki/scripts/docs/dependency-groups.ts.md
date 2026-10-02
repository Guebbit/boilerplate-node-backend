---
source: scripts/docs/dependency-groups.ts
sha256: 930e9be426805e60454de4366f2022316db2907c672af1a1a759bb3d51c010d4
generated_at: 2026-10-01T12:29:02.497456+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/dependency-groups.ts

## Purpose

The hand-maintained data source for `docs/tools/package-dependencies.md`: it declares which npm package belongs to which functional family (runtime or dev) and *why* it is there. The complementary half of that page — which packages exist and who imports them — is derived by `generate-dependency-map.ts` and intentionally kept out of this file to avoid drift.

## Key elements

- **`DependencyGroup`** (interface) — shape of one family: `name`, `purpose` (prose), `readMore` (doc links), `match` (array of package-name patterns).
- **`RUNTIME_GROUPS`** (const, exported) — 8 families covering production packages: HTTP core, security/auth, persistence, cache/messaging, email/rendering/media, observability, i18n, and declared config.
- **`DEV_GROUPS`** (const, exported) — 10 families covering tooling: TS toolchain, type definitions, testing, deeper testing (mutation/property/load), linting/formatting, architecture checks, commit hygiene, contracts/codegen, docs site, and maintenance.
- **`matchesGroup(packageName, patterns)`** (exported function) — returns `true` if `packageName` equals an exact entry in `patterns` or starts with a `prefix*` wildcard entry.

## Relationships

- **`scripts/docs/generate-dependency-map.ts`** — imports `RUNTIME_GROUPS`, `DEV_GROUPS`, and `matchesGroup` to classify every package it discovers in the dependency graph and render the "Grouped" and "Ungrouped" tables on the package-dependencies page.

## Notes

- **Wildcard syntax in `match`:** a trailing `*` means prefix match (e.g. `@opentelemetry/*`); everything else is an exact string comparison. No other glob characters are supported.
- **Ungrouped fallback:** a package that matches no group *and* is imported by more than one module is placed in an "Ungrouped" table on the generated page — it is visible, not an error.
- **Singleton packages are omitted on purpose:** a package matching no group but imported by exactly one module is listed under that module by the generator; restating it here would add no information.
- **Ordering matters implicitly:** groups are rendered in array order, so the listed sequence is the display order on the page.
- **`readMore` links are relative** to the docs page location (`./runtime.md`, `../theory/authorization.md`, etc.), not relative to this script.
