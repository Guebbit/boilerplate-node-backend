---
source: scripts/contracts/section-order.ts
sha256: a1a9cc094a4949bc17b1c3f5668dae00deffce7a7d26184b40415e25189f91de
generated_at: 2026-11-08T02:44:52.557762+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/section-order.ts

## Purpose

Provides a single pure function that resolves the final order of per-module sections in a bundle. It preserves a "preferred" (historical) ordering for sections that actually exist on disk, while gracefully dropping missing modules and appending any newly-discovered sections alphabetically. This keeps generated bundle diffs—and their PHP/frontend twins—small and stable over time.

## Key elements

- **`orderSections(preferred, present): string[]`** — The sole export. Given a preferred order list and the set of sections actually present, returns the intersection in preferred order followed by the remainder sorted alphabetically. Fully pure; no I/O, no side effects.

## Relationships

- **Bundle files** (`openapi-bundle.ts`, `authorization-bundle.ts`, `asyncapi-bundles.ts`, `asyncapi-section-fragments.ts`, `analytics-browser-events.ts`, `root-assembly.ts`) — Each bundler supplies its own `preferred` array (historical section order) and the discovered `present` set, then calls `orderSections` to produce the final section list before serializing output.
- **`tests/unit/scripts/contracts/section-order.test.ts`** — Unit-tests the pure function against known preferred/present combinations.

## Notes

- The `preferred` list is a *preference*, not a registry. Entries for modules that have been removed (e.g. via `demo:remove`) are silently ignored; modules the list has never seen are appended alphabetically. No manual synchronization is required.
- `toSorted()` is used (not `sort()`), so the input `present` array is never mutated.
- See `docs/theory/module-lifecycle.md` for the broader lifecycle context.
