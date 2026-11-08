---
source: tests/cross-cutting/scenario-fixtures.test.ts
sha256: ddff6a9b58dc8cbcf77925fd5f9a9f11425044c34cef3014014410786526d0e7
generated_at: 2026-11-08T09:31:25.964011+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/scenario-fixtures.test.ts

## Purpose

Validates two invariants of the locale scenario fixtures that no other test, index, or type system enforces: every locale entry references a language the dataset also registers, and no key is a dot-prefix of another key within the same `(locale, app)` tree. It reads the static `FIXTURES` directly (no database) and exists solely to close the gap between what other guards cover and what the data actually promises.

## Key elements

- **`it('gives every seeded locale entry a language the dataset also registers', …)`** — Collects the set of `tag` values from `localeFixtures`, then asserts no entry in `localeEntryFixtures` references a locale outside that set.
- **`it('never lets one locale entry key prefix another in the same tree', …)`** — Groups entry keys by `${locale}/${app ?? ''}` and asserts no key in a group is a dot-prefix of another key in the same group.
- **Imports** — `localeEntryFixtures` and `localeFixtures` from `@scenarios/locales` (the only external dependency).

## Relationships

- **`scenarios/locales.ts`** — Source of both `localeEntryFixtures` (array of `{locale, app, key, …}`) and `localeFixtures` (array of language objects with `tag`). This test is a pure consumer; it never mutates or re-exports the fixtures.

## Notes

- The file deliberately contains **no counting assertions** ("exactly N products", "at least one nested key"). Such census checks record an author's choice rather than a data invariant and break on every legitimate edit.
- The prefix check is scoped to `(locale, app)` — matching the tree the `@modules/locales/repository` layer actually builds — so two different apps may legitimately share a key prefix.
- The locale-registration test exists because the project's dangling-reference sweep only matches identifiers ending in `Id`; a `locale` field holding a bare language tag is invisible to that sweep.
- No `describe` wrapper, no named exports, no helper functions — the two `it` blocks are the entire module.
