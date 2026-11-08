---
source: shared/rules/schemas/frontend-links.schema.json
sha256: 2c9ff6ca0a31b4e35bb83d2e9b2cbdc70fd5d747951f403ff3f9a10eb9112668
generated_at: 2026-11-08T03:10:36.542097+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/frontend-links.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates the shape of a frontend navigation-links configuration object. It enforces the exact set of required route keys (customer-facing links, staff dashboard pages, and static pages) so that any configuration file or API payload supplying these routes is structurally correct before reaching frontend code.

## Key elements

- **Top-level object** — requires all three properties (`links`, `staffPages`, `staticPages`); rejects any additional top-level keys.
- **`links`** — object of 10 required, non-empty string route paths: `verify`, `reset`, `restore`, `emailChange`, `emailUndo`, `export`, `order`, `product`, `contact`, `privacy`. `additionalProperties: false` prevents ad-hoc keys.
- **`staffPages`** — object of 15 required, non-empty string route paths for the staff dashboard: `user`, `webhookSubscription`, `task`, `return`, `salesPayments`, `transfersDue`, `preordersLate`, `deliveryHoldsOpen`, `withdrawalsAwaitingGoods`, `returnsUndecided`, `lowStock`, `unshipped`, `awaitingTracking`, `undelivered`, `staleRefunds`. `additionalProperties: false`.
- **`staticPages`** — array of strings (no `minItems`, so an empty array is valid).

## Notes

- Every route string enforces `minLength: 1`; empty strings fail validation.
- Both `links` and `staffPages` use `additionalProperties: false`, so adding a new route key requires updating **this schema** in the same change as the configuration data.
- `staticPages` intentionally has no element-level constraint beyond `type: "string"` — no non-empty check.
- No `$id` or `$defs` are defined; the schema is self-contained and referenced by path rather than URI.
