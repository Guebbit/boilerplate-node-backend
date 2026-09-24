---
source: tests/cross-cutting/search.property.test.ts
sha256: 9b631bd90bbdc42471c407257ddf0119b893fc04d3489429c133e4ae8369609c
generated_at: 2026-09-23T20:00:03.531319+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/search.property.test.ts

## Purpose

Property-based (fast-check) tests for the search module's security-critical helpers. Two functions are treated as security controls rather than mere utilities: `escapeRegex` (prevents catastrophic-backtracking DoS via user-supplied `$regex` patterns on public endpoints) and `normalizePagination` (prevents negative/`NaN` skips that surface as 500 errors). Both are asserted as universal properties over arbitrary input, which a table of examples cannot express.

## Key elements

- **`RUN`** — Shared fast-check config: fixed seed `20_260_809`, 300 runs, `endOnFailure: true`. Counterexamples are written back with their seed.
- **`requestValue()`** — Arbitrary that models "anything a request can put in a pagination field" (`fc.anything()`, integers, strings, `undefined`), matching the `unknown` typing of `page`/`pageSize`.
- **`describe('escapeRegex')`** — Five properties: compiled-RegExp never throws; round-trip literal match; metacharacter alphabet (`$()*+.?[\]^{|}`) stripped of quantifying/anchoring power; alphanumeric text passes through unmodified; double-escaping is *not* idempotent (deliberate, single application site).
- **`describe('addTextFilter / addRegexFilter')`** — Three properties: every `$regex` clause produced is compilable; empty/whitespace-only input produces an empty filter object (avoids full-collection scan); one `$or` clause per requested field.
- **`describe('normalizePagination')`** — Four properties: skip is always a non-negative integer; `skip === (page − 1) × pageSize` identity; page 1 maps to skip 0; `buildPaginatedMeta` reports `totalPages: 0` for zero items.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — Sole source under test. Imports `escapeRegex`, `normalizePagination`, `addTextFilter`, `addRegexFilter`, `buildPaginatedMeta`. Every property here is a claim about those functions' behaviour over arbitrary input.
- **`search-regex.test.ts` / `search-pagination.test.ts`** (sibling example-based files, not in graph) — Complementary, not redundant. They own per-metacharacter diagnostics, a timing assertion (catastrophic-pattern defusal), and a negative `1.5` ≠ `1x5` case. This file owns totality over arbitrary strings, generated metacharacter *combinations*, and the non-idempotence property.

## Notes

- **Do not duplicate facts across the property and example test files.** The header explicitly warns: "A fact asserted twice is a fact maintained twice," and a static-mutant tooling replays the entire suite, making duplication costly. Check the example files before adding a case here.
- **Non-idempotency is a feature, not a bug.** `escapeRegex(escapeRegex(s))` intentionally produces a different (non-matching) result. The property test exists to prevent a future "hardening" wrapper at a call site.
- **Metacharacter spread** (`fc.constantFrom(...metacharacters)`) has an `eslint-disable` for `no-misused-spread` — safe because the set is ASCII-only with no surrogate pairs.
- **`fc.anything()` in `requestValue()`** is intentional: `page`/`pageSize` arrive as `unknown` at runtime (repeated query keys → arrays, JSON body → arbitrary values), so the arbitrary must be at least as wide as the type.
- **Seeded runs** guarantee reproducibility; if a counterexample is found, fast-check records the seed so the failing input can be reproduced deterministically.
