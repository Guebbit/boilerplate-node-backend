---
source: src/modules/returns/domain/restock.ts
sha256: d8501296530aadf6421f2aaf1e22e90ecf8c4d7acebc8d6a0029d4abec2e786c
generated_at: 2026-11-08T07:58:36.521859+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/restock.ts

## Purpose

Pure domain rule that decides how many units of each returned line go back on sale when goods are received. Staff can override the default (full quantity) per line—e.g. set a broken unit to 0. Keeping this as a stateless function makes the "broken unit never reaches the shelf" invariant testable without a database.

## Key elements

- **`RestockRequest`** (exported interface) — one staff-supplied entry: `productId` + `restock` count.
- **`ReturnedLine`** (internal interface) — the shape of a return line as this rule reads it; `productId` is typed as `{ toString(): string }` to stay decoupled from the concrete entity.
- **`RestockVerdict`** (exported type) — discriminated union: `{ ok: true; restocked: number[] }` or `{ ok: false; index: number; reason: 'unknown-product' | 'duplicate' | 'too-many' }`.
- **`resolveRestock(lines, requested)`** (exported const) — validates the optional staff request against the return's lines and returns per-line restock counts (defaulting to full quantity for unlisted lines) or the first failing request entry with its reason.

## Relationships

- **`src/modules/returns/domain/index.ts`** — barrel file that re-exports this module's public API (`RestockRequest`, `RestockVerdict`, `resolveRestock`) to the rest of the domain.
- **`src/modules/returns/services/receive.ts`** — service-layer caller that invokes `resolveRestock` as part of the goods-received workflow.
- **`src/modules/returns/tests/unit/domain.test.ts`** — unit tests exercising `resolveRestock` (happy path, each refusal reason, default-to-full behaviour).
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — delivery-side tests that assert the downstream invariant (a unit set to 0 by this rule is excluded from shelf stock and therefore from backorder fulfillment).

## Notes

- `requested` is optional (`undefined`); when absent every line is restocked in full.
- Validation is **first-error-wins**: the function returns on the first invalid entry and does not accumulate errors.
- `ReturnedLine.productId` is matched via `String(one.productId)`—any object with a `toString` works, which is why the concrete entity type is not imported here.
- The output array (`restocked`) is indexed identically to the input `lines` array, preserving line order.
