---
source: src/modules/products/domain/preorder.ts
source_sha256: b51b36b89086cf19ea6cf18a07b89d1fa49f99bc74aa17bad173b0961f86a212
context_sha256: f12bde890d84e1b141adf061707c86048fbca0e91bdc652a6d60d76d82981d69
generated_at: 2026-11-22T07:09:18.815663+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/domain/preorder.ts

## Purpose
Pure domain rules for preorders: whether a product counts as a preorder at a given moment, and the furthest-out release date a product may be given. The clock is passed in as an argument, so every case can be tested without waiting.

## Key elements
- `PreorderFacts` — the inputs the rule reads from a product: optional `active`, `purchasable` (both default to `true` when absent) and `releaseDate`.
- `isPreorder(facts, now)` — returns `true` only when the product is not inactive, not unpurchasable, has a `releaseDate`, and that date is strictly after `now`. The result is derived, never stored, so a product stops being a preorder when its date passes, with no job needed.
- `latestReleaseDate(now)` — returns `now` plus one calendar year, computed in UTC. This follows Google's `availability_date` rule.

## Relationships
The graph lists these neighbors, but the file imports nothing and its content shows no direct interaction with any of them. Based on the names alone, `src/modules/products/domain/index.ts` likely re-exports this module, and `src/modules/products/tests/unit/preorder.test.ts` likely tests it. Other neighbors, such as the cart, orders and inventory services and the sibling `availability.ts` and `backorder.ts`, are linked in the graph, but the details aren't visible here.

## Notes
- `active` and `purchasable` are treated as true unless explicitly `false`. `undefined` does not block a preorder.
- A `releaseDate` equal to `now` is not a preorder, because the comparison is strictly greater-than.
- `latestReleaseDate` uses `setUTCFullYear`, so the one-year bound is calendar-based in UTC, not a fixed number of days. The doc comment says this stops a leap day from shifting the bound by a day.
- `latestReleaseDate` only computes the bound. Enforcing it on writes is up to callers.
