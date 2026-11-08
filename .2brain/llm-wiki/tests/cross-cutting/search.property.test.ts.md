---
source: tests/cross-cutting/search.property.test.ts
sha256: 9b631bd90bbdc42471c407257ddf0119b893fc04d3489429c133e4ae8369609c
generated_at: 2026-11-08T09:32:15.463877+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/search.property.test.ts

## Purpose

Property-based tests (fast-check) that verify security-critical invariants of `escapeRegex` and `normalizePagination` for **every** possible input, not just sampled examples. `escapeRegex` is a denial-of-service control against MongoDB `$regex` catastrophic backtracking on public endpoints; `normalizePagination` must never emit a `skip` value that would crash the Mongo driver. These tests exist because a fixed table of examples cannot prove "no input reaches the engine as a live pattern."

## Key elements

- **`RUN`** — shared assertion config: fixed seed `20_260_809`, 300 runs, `endOnFailure: true`.
- **`requestValue()`** — fast-check arbitrary that mirrors the `unknown` type of pagination fields (repeated query keys, arbitrary JSON bodies).
- **`describe('escapeRegex')`** — five properties: compilability, literal round-trip match, metacharacter neutralisation (generated from the metacharacter alphabet), no over-escaping of alphanumerics, and non-idempotence (stated so callers don't double-wrap).
- **`describe('addTextFilter / addRegexFilter')`** — three properties: no uncompilable `$regex` in produced filters, empty/whitespace input adds no filter clause, one `$or` clause per requested field.
- **`describe('normalizePagination')`** — four properties: `skip` is never negative or NaN for any input, `skip === (page−1) * pageSize`, page 1 maps to skip 0, and `buildPaginatedMeta` reports zero pages for zero items.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — sole source under test. Imports `escapeRegex`, `normalizePagination`, `addTextFilter`, `addRegexFilter`, `buildPaginatedMeta`. Every property asserts on the *behaviour* of these functions (compilation, matching, computed `skip`), not on internal string shapes.
- **`fast-check` (`fc`)** — property oracle; all `fc.assert(fc.property(...))` calls reference the shared `RUN` constant.
- **`search-regex.test.ts` / `search-pagination.test.ts`** (sibling example-based suites, noted in header comment) — intentionally complementary. They own per-metacharacter named cases, timing assertions, and the `1.5 ≠ 1x5` negative case; this file owns totality over arbitrary strings, generated metacharacter *combinations*, and the non-idempotence property. The split is deliberate to avoid duplicate maintenance under the repo's static-mutant replays.

## Notes

- **Seed is fixed.** Counterexamples are written back as examples with their seed (per the file header); the seed in `RUN` is therefore the canonical reproduction point.
- **`escapeRegex` is applied exactly once.** The non-idempotence property is a *guard against a future refactor* that wraps it a second time, not a bug report.
- **Metacharacter array is built via `fc.constantFrom(...String.raw`$()*+.?[\]^{|}`)`** rather than a character-alphabet helper, to stay stable across fast-check major versions.
- **`requestValue()` is deliberately as wide as the type system allows** (`fc.anything()` included); narrowing it would weaken the "any input" claim.
- The `skip` invariant (`skip === (page−1) * pageSize`) matters because `search` issues `count` and `find` as two separate queries; a mismatched `skip` would silently drop rows.
