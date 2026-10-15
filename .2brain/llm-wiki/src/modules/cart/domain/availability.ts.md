---
source: src/modules/cart/domain/availability.ts
sha256: c0b565a37fd1464007d83dfcb6fc0503c062f232a1cb4c11ed97ff76f168a296
generated_at: 2026-10-15T10:22:36.797466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/availability.ts

## Purpose

Defines the single precedence rule that decides what a saved cart/wishlist line "can do right now." It is pure (no I/O, no side effects) so the same judgment can drive cart-line status, wishlist display, merge results, and checkout refusal without duplicating logic.

## Key elements

- **`LineAvailability`** (type) — the six-state union (`'in_stock' | 'insufficient_stock' | 'out_of_stock' | 'unavailable' | 'preorder' | 'removed'`) that every caller receives.
- **`AvailabilityProduct`** (interface) — the minimal product fields the rule inspects: `active`, `purchasable`, `deletedAt`, `preorder`.
- **`AvailabilityFacts`** (interface) — the three inputs to one judgment: the joined product (or `null`/absent), the ledger's `available` units, and the line's `quantity` (absent for wishlist lines).
- **`lineAvailability(facts)`** (const arrow fn, the sole business logic) — evaluates the five-state precedence in order: removed → unavailable → out_of_stock → insufficient_stock → preorder/in_stock. Returns the first matching status.

## Relationships

- **`./stock`** — imports `fitsStock`, which is the comparison used in the `insufficient_stock` branch.
- **`domain/index.ts`** — barrel re-export; external consumers pull `lineAvailability` and the types through the domain entry point rather than importing this path directly.
- **`tests/unit/line-availability.test.ts`** — unit test that exercises every branch of `lineAvailability`.

## Notes

- **Precedence is strict first-match.** Once a state is hit, lower-priority checks are skipped. For example, a product that is both `purchasable: false` and out of stock returns `'unavailable'`, never `'out_of_stock'`.
- **Preorder vs. shelf.** A preorder line is judged against its *allowance* (`available`), not against physical shelf stock. `out_of_stock` on a preorder means the allowance is exhausted, not that the shelf is empty.
- **`quantity` absent ⇒ wishlist.** When `quantity` is `undefined` (wishlist line), the `insufficient_stock` branch is unreachable, so a wishlist can only ever resolve to `removed`, `unavailable`, `out_of_stock`, `preorder`, or `in_stock`.
- **`available` nullish-reads as 0.** The expression `(available ?? 0) === 0` means a missing ledger entry is treated as zero units.
- **`product` may be `null` *or* `undefined`.** Both represent "lookup found nothing / hard-deleted" and map to `'removed'`.
