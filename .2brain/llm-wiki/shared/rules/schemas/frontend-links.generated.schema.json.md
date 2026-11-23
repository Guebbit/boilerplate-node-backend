---
source: shared/rules/schemas/frontend-links.generated.schema.json
source_sha256: 8d031857215e6c1cb8dc13285d316d8409adf329ac26452a92abca5780ad68a8
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:27:30.193467+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/frontend-links.generated.schema.json

## Purpose
A JSON Schema (draft 2020-12) describing the shape of a generated "frontend links" data object. It defines which user-facing link keys, staff admin page keys, and static pages must be present. The `.generated.` filename indicates it is produced by tooling, not hand-edited.

## Key elements
- **`links`** (object, all required, non-empty strings): `verify`, `reset`, `setup`, `restore`, `emailChange`, `emailUndo`, `export`, `order`, `product`, `contact`, `privacy`, `terms`.
- **`staffPages`** (object, all required, non-empty strings): `user`, `webhookSubscription`, `task`, `return`, `order`, `inventory`, `salesPayments`, `transfersDue`, `preordersLate`, `deliveryHoldsOpen`, `returnsAwaitingGoods`, `returnsUndecided`, `lowStock`, `unshipped`, `awaitingTracking`, `undelivered`, `staleRefunds`.
- **`staticPages`** (array of strings): list of static page identifiers. There is no `minLength` or uniqueness constraint on items.

## Relationships
No graph neighbors. Nothing in the file references other files, for example through `$ref`.

## Notes
- All three objects use `additionalProperties: false`, and the top level does too. Adding a link or page key therefore requires regenerating or updating the schema, or validation fails.
- Link and page values are only constrained to be non-empty strings. The schema does not enforce URL format or path templates.
- Because the file is generated, edit its source and regenerate rather than changing the JSON directly. The source is not visible here.
