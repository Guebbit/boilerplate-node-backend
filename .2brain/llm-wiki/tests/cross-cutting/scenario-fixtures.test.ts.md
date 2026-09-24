---
source: tests/cross-cutting/scenario-fixtures.test.ts
sha256: 6686fa17c5c17b47b986b5f439b33088af7c07121dde68db8611271fe51e825d
generated_at: 2026-09-23T19:59:18.835400+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/scenario-fixtures.test.ts

## Purpose

Validates two structural invariants of the locale scenario fixtures that no other test in the repo covers: referential integrity (every entry's `locale` is a registered language tag) and non-prefix uniqueness (no key is a dot-prefix of another key within the same `(locale, tenant)` tree). Operates directly on the fixture arrays — no database, no seeding.

## Key elements

- **`localeEntryFixtures`, `localeFixtures`** (imported from `@scenarios/locales`) — the raw fixture arrays under test.
- **Test: "gives every seeded locale entry a language the dataset also registers"** — builds a `Set` of registered language tags from `localeFixtures`, then asserts no entry in `localeEntryFixtures` references a tag outside that set.
- **Test: "never lets one locale entry key prefix another in the same tree"** — groups entry keys by `` `${locale}/${tenant ?? ''}` `` and asserts no key in a group is a `startsWith(key + '.')` prefix of a sibling.

## Relationships

- **`scenarios/locales.ts`** — sole dependency. Supplies both `localeFixtures` (registered languages) and `localeEntryFixtures` (the keyed entries) that the tests consume.

## Notes

- The file deliberately excludes "census" assertions (counts, "at least one X"). The module comment states the rationale: a census fails on every legitimate edit and says nothing when it passes. Only rule-level invariants belong here.
- The prefix test scopes by `(locale, tenant)` because that is the grouping `@modules/locales/repository` uses when building a message tree; two tenants may legitimately share a key that one tenant holds as a prefix of another.
- The referential-integrity test exists because the build's dangling-reference sweep only matches keys ending in `Id`; a `locale` tag reference would otherwise go unchecked.
