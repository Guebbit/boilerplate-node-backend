---
source: tests/cross-cutting/scenario-fixtures.test.ts
sha256: ddff6a9b58dc8cbcf77925fd5f9a9f11425044c34cef3014014410786526d0e7
generated_at: 2026-10-29T06:49:37.468761+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/scenario-fixtures.test.ts

## Purpose

Validates two structural invariants of the scenario locale fixtures that no other test or type guard enforces: every entry references a language the dataset actually registers, and no key is a prefix of a sibling key within the same `(locale, app)` tree. It reads fixture constants directly — no database, no seeding — and deliberately excludes assertions already covered by integration tests, the unique index, or TypeScript's type system.

## Key elements

- **`it('gives every seeded locale entry a language the dataset also registers')`** — Builds a `Set` of registered language tags from `localeFixtures`, then flags any `localeEntryFixtures` entry whose `locale` is not in that set. Prevents orphan entries that would render as a dictionary the manifest never lists.
- **`it('never lets one locale entry key prefix another in the same tree')`** — Groups entries by `${locale}/${app}`, then asserts no key in a group is a dot-prefixed prefix of another key in that group (e.g. `products.list` vs `products.list.title`). Scoped per tree because the repository builds one tree per `(locale, app)` pair.

## Relationships

- **`scenarios/locales.ts`** — Source of the two imported constants: `localeFixtures` (the registered language list) and `localeEntryFixtures` (the individual key entries). This file is the sole consumer that cross-references the two against each other; no other test makes those specific claims.

## Notes

- The module docstring explicitly lists six invariants this file does **not** assert (seeded-shop guarantees, response-shape parsing, `(locale, app, key)` uniqueness, credential matching, fallback-locale rows, domain-name safety) and points to where each is already enforced.
- Deliberately avoids census-style assertions (e.g. "exactly one soft-deleted product"). The rationale: counting fixtures records a one-time authorial choice, fails on every legitimate edit, and is silent when it passes.
- The prefix check uses `startsWith(key + '.')` rather than a plain `startsWith(key)` to avoid flagging legitimate siblings like `a.b` and `a.bc`.
