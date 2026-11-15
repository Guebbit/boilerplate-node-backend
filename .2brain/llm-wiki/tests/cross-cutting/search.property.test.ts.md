---
source: tests/cross-cutting/search.property.test.ts
sha256: c704ec988e5abf959543c0d1e15f13ef4f3126335b69d7df752172f4c4c7f075
generated_at: 2026-11-14T23:07:28.630763+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/search.property.test.ts

## Purpose

Property-based tests (via `fast-check`) that verify security and correctness guarantees of the search persistence layer over **arbitrary** inputs. The two central claims are: (1) `escapeRegex` turns any user string into a literal-match `RegExp` with no catastrophic-backtracking or compile-error risk, and (2) `normalizePagination` never produces a `skip` value that would cause a Mongo driver error. The file exists to close the gap that example-based tests (in sibling files) cannot: totality over unbounded input space.

## Key elements

- **`RUN`** — shared `fast-check` config: fixed seed `20260809`, 300 runs, `endOnFailure: true`. All `fc.assert` calls in the file use this.
- **`requestValue()`** — an `fc.Arbitrary<unknown>` combining `fc.anything()`, `fc.integer()`, `fc.string()`, `fc.constant(undefined)`. Models the full width of what a repeated query key or JSON body can deliver to pagination fields (typed `unknown` by design).
- **`describe('escapeRegex')`** — five properties: compilability, self-match round-trip, metacharacter neutralisation (drawn from the metacharacter alphabet via `constantFrom` + `array`), no over-escaping of alphanumerics, and explicit non-idempotence.
- **`describe('addTextFilter / addRegexFilter')`** — three properties: every generated filter clause compiles, blank/whitespace-only input writes no filter at all, and clause count equals field count.
- **`describe('normalizePagination')`** — four properties: `skip` is always a non-negative integer for any `unknown` input; `skip === (page-1)*pageSize` identity; page 1 maps to skip 0; `buildPaginatedMeta` reports 0 pages for 0 items.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — the sole production import. Provides `escapeRegex`, `normalizePagination`, `addTextFilter`, `addRegexFilter`, and `buildPaginatedMeta`, all of which are the subjects under test. No other module is imported.

## Notes

- The metacharacter list is built with `fc.constantFrom(...metacharacters)` + `fc.array` rather than a character-alphabet helper, to stay agnostic across `fast-check` major versions (the helper's name has moved). An eslint-disable for `no-misused-spread` is required; it is safe because the alphabet is ASCII-only.
- `fast-check`'s `stringMatching` rejects the `i` flag, so the alphanumeric "no over-escape" property needs an eslint-disable for `regexp/use-ignore-case`.
- The non-idempotence test is a **deterministic** assertion (not `fc.assert`) intentionally placed inside the `escapeRegex` block to document that double-escaping breaks matching — a guard against a future "hardening" refactor.
- `endOnFailure: true` means a single counterexample halts the run; the seeded config is meant to be replayable when a failure is reported.
- The file is described in its own header as part of a **static-mutant-replayed** suite, so duplicated assertions across files multiply maintenance cost.
