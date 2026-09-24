---
source: src/modules/orders/domain/rules.ts
sha256: 3a49d0ee6021db99313f7ee171dbae125c93ed1ef10d670be20540f8a948fd22
generated_at: 2026-09-23T19:01:55.939691+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/rules.ts

## Purpose

Pure business-rule validation for order lines. Given candidate lines (already joined to their products), it returns a typed verdict (`ok` or a specific refusal reason). It intentionally contains no status codes, no i18n strings, and no side effects — the service layer is responsible for translating verdicts into HTTP responses.

## Key elements

- **`OrderLineCandidate`** — the minimal shape the rules need per line: an optional `quantity` and an optional `product`. A missing/`null` `product` signals the product reference no longer resolves.
- **`OrderLinesVerdict`** — discriminated union: `{ ok: true }` or `{ ok: false; reason: 'no-lines' | 'product-missing' }`. The two refusal reasons are distinct because they map to different status codes downstream.
- **`checkOrderLines(lines: readonly OrderLineCandidate[]): OrderLinesVerdict`** — the sole entry point. Checks (in order) that the array is non-empty, then that every line has a resolvable product. Returns the first failure it encounters.

## Relationships

- **`src/modules/orders/domain/index.ts`** — barrel file; re-exports the types and function defined here so other modules can import from the domain index rather than reaching into individual rule files.
- **`src/modules/orders/services/place.ts`** — calls `checkOrderLines` during order placement and maps each `reason` to the appropriate HTTP status code and localized message.
- **`src/modules/orders/tests/unit/domain-rules.test.ts`** — unit-tests `checkOrderLines` against the three verdict branches.

## Notes

- Check order is significant: `no-lines` is evaluated before `product-missing`. If you ever add a new refusal reason, place it in the priority order you want the service to surface.
- `product` is typed `unknown`, not a concrete model — the domain layer deliberately does not depend on the product schema. Only presence/absence matters here.
- The `quantity` field on `OrderLineCandidate` is currently read by nothing in this file. It exists to document the full candidate shape for callers and may be consumed by future rules.
