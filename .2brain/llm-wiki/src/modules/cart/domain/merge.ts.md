---
source: src/modules/cart/domain/merge.ts
sha256: 58159e66d9ad1b02587b7f211e57ee567df73174ee39cad2970694a8b5d6cba6
generated_at: 2026-11-14T19:28:34.203489+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/merge.ts

## Purpose

Pure domain rule that decides how many units a single guest line adds to a cart, given the current cart state and the product's listing status. It exists to keep the merge calculation free of I/O—no catalogue lookups, no model access—so the cap and listing flag are supplied by the caller.

## Key elements

- **`MergeLineFacts`** (interface) — Input bundle: `requested`, `held`, `listed`, `lineMax`, `lines`, `maxLines`.
- **`MergePlan`** (interface) — Output: `add` (units to write, `0` = write nothing) and optional `reason` (`MergeLineReason`).
- **`planMergeLine(facts): MergePlan`** — The sole function. Evaluates, in order: unlisted → `removed`; new line with no slot → `cart_full`; over-cap → `capped`; already-held increase → `summed`; otherwise no reason. Returns the computed `add` count.

## Relationships

- **`src/types/index.ts`** — Source of the `MergeLineReason` type imported for `MergePlan`.
- **`src/modules/cart/domain/index.ts`** — Barrel file; re-exports this module so the rest of the domain can import `planMergeLine` and its interfaces.
- **`src/modules/cart/services/merge.ts`** — Service-layer caller that assembles the `MergeLineFacts` (fetching listing status, cart state, catalogue cap) and invokes `planMergeLine`, then performs the side-effects (persistence, stock flagging via `fitsStock`).
- **`src/modules/cart/tests/unit/merge-rule.test.ts`** — Unit tests exercising `planMergeLine` across all reason branches.

## Notes

- **Stock is intentionally absent.** A sold-out line is added the same as any other; the caller is expected to flag inventory separately. The doc comment explicitly warns against lowering the line to available stock, as that would enable an exact-stock read via a large `requested` value (see `docs/theory/defences/authorization.md`).
- **Reason priority is fixed and ordered:** `removed` > `cart_full` > `capped` > `summed`. Only one reason is ever reported.
- **`summed` is informational, not an error.** It simply indicates the line merged into an existing holding. `capped` signals the shopper received fewer units than asked.
- **`add` can be `0` without a `reason`** only in the theoretical case where `requested` is `0`; the two `0`-add branches (`removed`, `cart_full`) always carry a reason.
