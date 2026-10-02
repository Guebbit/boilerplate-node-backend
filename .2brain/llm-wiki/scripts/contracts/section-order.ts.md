---
source: scripts/contracts/section-order.ts
sha256: a1a9cc094a4949bc17b1c3f5668dae00deffce7a7d26184b40415e25189f91de
generated_at: 2026-10-01T12:28:25.849859+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/section-order.ts

## Purpose

Provides a single pure function that resolves the display order of per-module sections within a bundle. It exists so that diffs stay small over time: sections keep their historical positions, while new or previously-unknown sections are appended alphabetically. No side effects, no I/O.

## Key elements

- **`orderSections(preferred, present)`** — The only export. Takes a *preferred* (historical) list of section names and the set of sections that actually exist on disk. Returns the preferred entries that are present, in their original order, followed by any extra present sections sorted alphabetically (`toSorted`). Entries in `preferred` with no matching on-disk section are silently dropped; sections in `present` but absent from `preferred` are appended in alphabetical order.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`, `scripts/contracts/asyncapi-bundles.ts`, `scripts/contracts/authorization-bundle.ts`, `scripts/contracts/root-assembly.ts`** — Each bundler calls `orderSections` to arrange its module sections before emitting output. The `preferred` argument is the bundler's hard-coded historical order; `present` is the list of sections it actually discovered.
- **`tests/unit/scripts/contracts/section-order.test.ts`** — Unit-test coverage for `orderSections` (ordering, filtering of absent entries, alphabetical append of extras).

## Notes

- The `preferred` list is a *preference*, not a registry. It never needs manual upkeep: stale entries are filtered out, and new modules are picked up automatically. The only invariant is "historical sections keep their relative order."
- `present` is expected to be a flat list of section names (strings), not objects. The function does no disk I/O itself; the caller is responsible for determining what exists.
- `toSorted()` (non-mutating) is used for the alphabetical suffix, so `present` is never reordered in place.
- See `docs/theory/module-lifecycle.md` (referenced in the file header) for the broader rationale behind stable section ordering.
