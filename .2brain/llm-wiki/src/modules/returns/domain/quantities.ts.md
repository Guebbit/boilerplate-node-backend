---
source: src/modules/returns/domain/quantities.ts
sha256: 9b3952d4565e4afc76fd63f4493e0869fc35974a262cf108a49200bff964af89
generated_at: 2026-10-15T11:52:46.997414+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/quantities.ts

## Purpose

Pure functions that compute how much of an order can still be returned and validate a customer's requested lines against that remainder. Keeping this logic database-free makes the core "what can come back" rule unit-testable in isolation.

## Key elements

- **`ProductQuantity`** (interface) — A single line: `productId: string` + `quantity: number`.
- **`wireLines`** — Normalises heterogeneous lines (ObjectId or string) into `ProductQuantity[]` keyed by string id.
- **`returnableLinesOf`** — Filters an order's items, excluding goods marked as non-withdrawable (Art. 16), and maps the rest to `ProductQuantity[]`.
- **`returnableQuantities`** — Subtracts all already-returned lines from the ordered lines, returning a `Map<string, number>` of per-product remaining units (floored at 0).
- **`LinesVerdict`** (type) — Discriminated union: `{ ok: true; lines }` or `{ ok: false; reason: 'nothing-returnable' | 'unknown-product' | 'too-many' }`.
- **`checkRequestedLines`** — Validates requested lines (or defaults to "everything remaining" when `undefined`/empty). Summs duplicate product ids, rejects unknown products or over-requests.
- **`takesLastUnit`** — Returns `true` when `accountedFor` covers every ordered unit across all products; used to decide which act triggers a shipping refund.

## Relationships

- **`domain/index.ts`** — Re-exports every symbol in this file so services import from the domain barrel.
- **`services/create.ts`** — Calls `wireLines`, `returnableLinesOf`, `returnableQuantities`, and `checkRequestedLines` to resolve the final lines when creating a return.
- **`services/cancel-remainder.ts` / `services/cancellation-refund.ts`** — Use `takesLastUnit` to determine whether a cancellation accounts for the last unit and therefore owns the shipping refund.
- **`services/receive.ts`** — Consumes `returnableQuantities` to verify received goods against what was still returnable.
- **`services/options.ts`** — Reads `returnableQuantities` / `checkRequestedLines` to surface what a customer *could* request.
- **`services/outcome.ts` / `services/projection.ts`** — Reference `ProductQuantity` and `takesLastUnit` when projecting the post-return state.
- **`domain/accounting.ts`** — Works alongside this file for the financial side (amounts); this file handles the *quantity* side.
- **`tests/unit/domain.test.ts`** — Direct unit tests for every export in this file.
- **`delivery/tests/unit/fulfillment.test.ts`** — Exercises `takesLastUnit` in the context of a delivery fulfilment scenario.

## Notes

- All product-id comparisons go through `String(id)`. When passing ObjectIds from the database, always run them through `wireLines` or `returnableLinesOf` first; comparing a raw ObjectId to a string will silently fail.
- `returnableQuantities` floors at 0 per product (`Math.max(0, …)`), so over-returns in earlier documents won't produce negative remainders.
- `checkRequestedLines` with `requested === undefined` or `[]` means "all that remains" — this is the default withdrawal path, not an error case.
- `takesLastUnit` compares against **ordered** quantity, not returnable quantity. An excluded (Art. 16) line therefore prevents the order from ever being "whole," which is intentional: the shipping refund for that line is never triggered.
