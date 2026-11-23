---
source: src/modules/cart/domain/merge.ts
source_sha256: b0bbe987a19d5ab11945d6348a7a79ceebe102c78041302cad094ef4e57e09bd
context_sha256: 30991d58a72d979bef67e8da0d21dd7b836944562ced01c26ad5488c86cc3536
generated_at: 2026-11-22T04:32:20.840849+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/domain/merge.ts

## Purpose
Pure cart-merge rule: decides what a single guest cart line becomes, given what the cart already holds and whether the product is listed. The per-line cap and line limit are passed in as data, so this layer touches neither the catalogue nor the model.

## Key elements
- `MergeLineFacts` (interface): input for one line. It carries `requested`, `held`, `listed`, `lineMax`, `lines` (current line count) and `maxLines`.
- `MergePlan` (interface): the verdict. `add` is the units to add (`0` writes nothing). `reason` is optional and absent when the line lands exactly as asked.
- `planMergeLine(facts)`: the only function. It returns a `MergePlan`. The rule runs in this order:
  1. Product not `listed`: `{ add: 0, reason: 'removed' }`.
  2. New product (`held === 0`) and `lines >= maxLines`: `{ add: 0, reason: 'cart_full' }`.
  3. Otherwise `wanted = held + requested` and `target = min(wanted, lineMax)`, so `add = target - held`.
  4. If `target < wanted`, the reason is `capped`. Else if `held > 0`, it is `summed`. Else there is no reason.

## Relationships
- `src/types/index.ts`: supplies the `MergeLineReason` type (imported as `@types`) for the optional reason on a plan.
- `src/modules/cart/domain/index.ts`: the domain layer's index, a neighbor of this file.
- `src/modules/cart/services/merge.ts`: a neighbor in the dependency graph. By the module doc, the caller supplies the facts and the cap, and flags stock through `fitsStock`.
- `src/modules/cart/tests/unit/merge-rule.test.ts`: unit tests for the rule.

## Notes
- Stock is deliberately ignored. A sold-out or short product is added like any other and flagged by the caller via `fitsStock`. Lowering the line to what is for sale would let a caller read exact stock by merging 999.
- Only deleted or hidden products count as unlisted. A product that is merely off sale is listed and takes a line.
- When several reasons apply, the first in this order is reported: `removed`, `cart_full`, `capped`, `summed`. `capped` means the shopper got less than they asked for. `summed` is only context.
- The `cart_full` check applies only to new products (`held === 0`). Adding to an existing line never hits it.
- The merge mirrors what `POST /cart/items` would add, no more.
