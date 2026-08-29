# tests/cross-cutting/search.property.test.ts

## Purpose

Property-based tests (fast-check) for the security-critical helpers in `src/infrastructure/persistence/search.ts`. `escapeRegex` is treated as a denial-of-service control against catastrophic MongoDB backtracking from public endpoints; `normalizePagination` must never emit a skip value that the Mongo driver rejects. Because both are claims about *every* possible input, the file uses generated arbitraries rather than fixed tables.

## Key elements

- **`RUN`** — shared execution config: `seed: 20_260_809`, `numRuns: 300`, `endOnFailure: true`. All `fc.assert` calls use this constant so counterexamples are reproducible.
- **`requestValue()`** — arbitrary that mirrors the `unknown` typing of pagination fields on the wire (repeated query keys → arrays, JSON → anything). Combines `fc.anything()`, `fc.integer()`, `fc.string()`, `fc.constant(undefined)`.
- **`describe('escapeRegex')`** — five properties: (1) output always compiles as a `RegExp`; (2) round-trip literal match; (3) generated metacharacter strings lose all special power; (4) alphanumeric text passes through unchanged (no over-escaping); (5) non-idempotence — double-escaping breaks matching.
- **`describe('addTextFilter / addRegexFilter')`** — three properties: no uncompilable `$regex` is written for any input; empty/whitespace-only input produces no filter clause at all; one `$or` clause per requested field.
- **`describe('normalizePagination')`** — four properties: skip is always a non-negative integer (no `NaN`/negative); skip === `(page-1)*pageSize`; page 1 maps to skip 0; zero items report zero total pages via `buildPaginatedMeta`.

## Relationships

- **Imports from `src/infrastructure/persistence/search.ts`** — the sole production dependency. All five functions tested (`escapeRegex`, `addTextFilter`, `addRegexFilter`, `normalizePagination`, `buildPaginatedMeta`) are exercised through their public API; the tests assert behaviour (regex compiles, matches literally, skip is valid) rather than internal string shape.

## Notes

- **Seeded.** The fixed seed means a failing run is reproducible; a new counterexample should be written back as a named example with its seed.
- **Deliberate split.** Example-based tests for the same functions live in `search-regex.test.ts` and `search-pagination.test.ts`. Those files own per-character diagnostics, a timing assertion for catastrophic patterns, and a `1.5`-vs-`1x5` negative case. This file owns totality over arbitrary input, *combinations* of metacharacters, and the non-idempotence property. Check the example files before adding a case here to avoid duplicate assertions (the repo runs a static mutant across the whole suite, so duplication is costly).
- **Metacharacter alphabet built via `fc.constantFrom(...spread)`** rather than a `fc.oneof`/`fc.stringOf` helper whose name shifted between fast-check majors. The eslint-disable on that line is intentional: the characters are all ASCII, so surrogate-pair concerns don't apply.
- **`fc.pre(text.trim().length > 0)`** in the "one clause per field" test guards against the empty-input case, which is covered separately above.
