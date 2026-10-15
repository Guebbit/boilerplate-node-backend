---
source: src/modules/cart/domain/merge.ts
sha256: d646f478949e659ef39fc7e3615dcfb4aab698c460e8c0b5ed478be68d247508
generated_at: 2026-10-15T10:22:54.608803+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/merge.ts

## Purpose

Pure domain rule that decides how many units a single guest cart line adds to an existing cart, given the current held quantity, whether the product is listed, and the per-line cap. It is side-effect-free and intentionally knows nothing about stock, the catalogue, or persistence — the caller supplies all context.

## Key elements

- **`MergeReason`** — union type `'summed' | 'capped' | 'removed'`; the contract's explanation for why a line didn't land exactly as requested.
- **`MergeLineFacts`** — input shape: `requested`, `held`, `listed` (publicly visible), `lineMax` (per-line ceiling).
- **`MergePlan`** — output shape: `add` (units to write) and an optional `reason`.
- **`planMergeLine(facts)`** — the single exported function. Returns `{ add }` when the line fits exactly; otherwise attaches the first applicable reason in priority order: `removed` (product not listed) → `capped` (hit the line cap) → `summed` (merges on top of existing quantity).

## Relationships

- **`src/modules/cart/domain/index.ts`** — barrel file that re-exports this module's types and `planMergeLine` for consumers within the cart domain.
- **`src/modules/cart/services/merge.ts`** — service-layer caller; passes in resolved facts (catalogue listing, stock check via `fitsStock`, the line cap) and receives the `MergePlan` to execute the write.
- **`src/modules/cart/tests/unit/merge-rule.test.ts`** — unit tests exercising `planMergeLine` across the reason-priority and boundary cases.

## Notes

- **Stock is deliberately excluded.** A sold-out or short product is merged the same way as any other. The caller is responsible for capping via `fitsStock`; doing it inside the rule would let a probing caller read exact stock by requesting 999 (see `docs/theory/defences/authorization.md`, "Reading the shelf").
- **Reason priority is fixed and singular.** When multiple conditions apply, only the highest-priority reason is reported (`removed` > `capped` > `summed`). `summed` is informational context, not an error.
- **`reason` is omitted (not set to a neutral value)** when the line lands exactly as asked — i.e. `held` is 0 and the cap is not hit.
- The file has zero imports; it is a leaf module in the domain layer.
