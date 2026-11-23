---
source: scripts/contracts/section-order.ts
generated_at: 2026-11-22T02:00:25.790571+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/section-order.ts

## Purpose
Pure helper that decides the order in which a contract bundle lists its per-module sections. Keeping sections in their historical positions keeps bundle diffs small (including the PHP twin's and the frontend's). The order list passed in is a preference, not a registry, so nothing has to be kept in sync by hand.

## Key elements
- `orderSections(preferred, present)` — returns the entries of `preferred` that also appear in `present` (in preferred order), followed by every remaining `present` section sorted alphabetically (`toSorted()`).
  - `preferred`: historical order; entries for modules that don't exist are ignored (e.g. a module removed by `demo:remove`).
  - `present`: every section that actually exists on disk.

## Relationships
- The neighbors listed (`analytics-browser-events.ts`, `asyncapi-bundles.ts`, `asyncapi-section-fragments.ts`, `authorization-bundle.ts`, `openapi-bundle.ts`, `root-assembly.ts`) are in the same contracts directory and are linked to this file in the dependency graph. The file's own comment says the preferred list is passed in by "each bundler", so these bundlers are its likely callers. The file itself imports nothing.
- `tests/unit/scripts/contracts/section-order.test.ts` tests it directly. The function is pure so the test can walk it without touching the filesystem.

## Notes
- A module that isn't in `preferred` is appended alphabetically, so new modules need no edit here.
- Duplicates in `preferred` or `present` aren't deduplicated. Each is kept as given.
- Matching uses exact string equality via `includes`.
- The header comment references `docs/build/module-lifecycle.md#_3-·-the-fragments` for background.
