---
source: src/modules/returns/domain/restock.ts
sha256: d8501296530aadf6421f2aaf1e22e90ecf8c4d7acebc8d6a0029d4abec2e786c
generated_at: 2026-10-29T05:38:14.855382+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/restock.ts

## Purpose

Pure domain rule that decides how many units of each returned line go back on sale once goods are received. It isolates the "keep a broken unit off the shelf" logic from persistence so the invariant is testable without a database.

## Key elements

- **`RestockRequest`** (exported) — one line of staff input: `productId` + `restock` count (0 = broken/scrapped).
- **`ReturnedLine`** (internal) — the minimal shape of a return line the rule reads (`productId` with a `toString()`, `quantity`).
- **`RestockVerdict`** (exported) — discriminated union: `{ ok: true, restocked: number[] }` or `{ ok: false, index, reason: 'unknown-product' | 'duplicate' | 'too-many' }`.
- **`resolveRestock`** (exported) — validates the request against the lines and returns either the per-line restock array (in line order, defaulting to full quantity for un-named lines) or the first failing entry with a reason.

## Relationships

- **`src/modules/returns/domain/index.ts`** — barrel file; re-exports this module's public symbols for other parts of the returns domain.
- **`src/modules/returns/services/receive.ts`** — calling service; invokes `resolveRestock` during the goods-received step to determine the final on-sale quantities before persisting.
- **`src/modules/returns/tests/unit/domain.test.ts`** — unit tests exercising `resolveRestock` directly (happy path, each rejection reason, default-fallthrough).
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — integration-adjacent tests where the restock rule is exercised indirectly through the delivery/fulfillment flow.

## Notes

- `productId` on `ReturnedLine` is typed as `{ toString(): string }` rather than `string`, so the rule works with wrapper/value objects without requiring a `.toString()` call at the interface level. The implementation compares via `String(one.productId)`.
- Validation is **first-failure-wins**: only one error is reported (the earliest `index` that trips a rule), not a list of all problems.
- Order of checks per entry: unknown-product → duplicate → too-many. A product that is both unknown and duplicated will surface as `unknown-product` because the `lines.find` short-circuits first.
- The function is intentionally pure and side-effect-free; it must not be refactored to reach into repositories or external state.
