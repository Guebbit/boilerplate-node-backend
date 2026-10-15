---
source: src/modules/inventory/domain/hold-lines.ts
sha256: df7e12cc40ead5dd9d7b9b439661cfd58bd3ff8453d8138461ed451943e61589
generated_at: 2026-10-15T10:34:25.583318+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/hold-lines.ts

## Purpose

Pure arithmetic for removing lines from a hold: given what a hold currently sets aside and the lines being shipped or cancelled, it computes how much actually comes out and what remains. Extracted as a pure module so the partial-shipment and remainder-cancel calculations are testable in isolation, without a database.

## Key elements

- **`HoldLine`** — `{ productId, quantity, kind? }`. A single product entry on a hold. `kind` distinguishes shelf units (`stock`, the default) from preorder claims (`preorder`).
- **`HoldTake`** — The return shape of `takeFromHold`: `{ remaining: HoldLine[]; taken: HoldLine[] }`.
- **`takeFromHold(items, lines)`** *(exported)* — Subtracts `lines` from `items` per (product, kind), clamped at zero. For a `preorder` line it first draws from the preorder bucket, then falls back to the stock bucket of the same product for the shortfall. Returns the residual hold lines and the lines actually removed.
- **`keyOf`** *(private)* — Builds the composite map key `"{productId}|{kind}"`, defaulting kind to `stock`.
- **`takeOf`** *(private)* — Takes up to *quantity* units from a single key in a `Map<string, number>`, recording the delta in a companion "taken" map. Returns the actual amount taken (≤ requested).

## Relationships

- **`./transitions`** — Imports the `HoldKind` type used to tag lines as `stock` or `preorder`.
- **`./index`** — Barrel re-export; makes `HoldLine`, `HoldTake`, and `takeFromHold` available to consumers importing from the domain module root.
- **`src/modules/inventory/services/holds.ts`** — Service-layer consumer that invokes `takeFromHold` to compute the new hold state before persisting.
- **`src/modules/inventory/tests/unit/hold-lines.test.ts`** — Dedicated unit tests for the pure function.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Integration-level tests in the delivery module that exercise the hold-line arithmetic as part of the fulfillment flow.

## Notes

- **Preorder fallback is the non-obvious path.** When a line has `kind: 'preorder'`, `takeFromHold` first satisfies it from the `preorder` bucket; any shortfall is drawn from the *stock* bucket of the same product. This prevents allocated shelf units from being stranded on a hold after a remainder cancel. A plain `stock` line never triggers the fallback.
- **`kind` is omitted rather than set to `'stock'`** in the output. `toLines` only attaches `kind` when it is `'preorder'`, keeping the serialized shape minimal.
- **Inputs are `readonly`; no external mutation.** The function builds fresh `Map`s internally. The `takeOf` helper mutates those local maps only.
- **A line may request more than the hold contains.** `takeOf` clamps at zero via `Math.min`; the `taken` array reflects only what was actually available, not the requested amount.
