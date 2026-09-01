# src/modules/orders/tests/unit/emails.test.ts

## Purpose
Unit tests for the two customer-facing money-rendering builders in the orders module — `orderConfirmEmail` and `invoiceDocument`. The file exists to catch the specific failure mode where a formatting slip (swapped fields, missing line, recomputed total, untranslated key) is read as a billing error by the end customer. It explicitly does **not** re-derive the total; it only asserts the builder defers to `orderTotal`.

## Key elements
- **`ORDER`** – Shared fixture: two items with distinct titles, quantities, and prices, plus a non-zero `shippingCost`. Chosen so no field can accidentally stand in for another.
- **`describe('orderConfirmEmail', …)`** – Nine tests covering: correct template name, one line per item, per-line field fidelity, total defers to `orderTotal`, shipping is included in the total, customer name is interpolated (no `{{…}}` residue), empty-items array doesn't throw, locale propagation, and no unresolved `orders.*` translation keys.
- **`describe('invoiceDocument', …)`** – Four tests covering: per-line fidelity, order id in `pageMetaTitle`, non-string id (object with `toString`) rendered safely (no `[object Object]`), and locale propagation.
- **Imports** – `orderConfirmEmail`, `invoiceDocument`, `OrderLines` from `@modules/orders/emails`; `orderTotal` from `@modules/orders/domain`.

## Relationships
- **`src/modules/orders/emails.ts`** – The module under test. Provides both builder functions and the `OrderLines` type used by the fixture.
- **`src/modules/orders/domain/index.ts`** – Re-exports `orderTotal`, which the test calls to compute the expected total string and assert the email's `data.total` contains it.
- **`src/modules/orders/domain/totals.ts`** – Where `orderTotal` is actually implemented. The test header comment notes its correctness is covered separately by `totals.property.test.ts`; this file only checks the email *uses* it.

## Notes
- The total assertion is an **anti-drift** check (`data.total` contains `String(orderTotal(ORDER))`), not a re-implementation. Do not replace it with a local sum.
- The invoice `id` parameter is typed `unknown` (real orders carry ObjectIds as often as strings). The `[object Object]` test guards the `String(id)` coercion inside the builder — removing that coercion is invisible until a customer receives a malformed title.
- The empty-items test applies only to `orderConfirmEmail`; `invoiceDocument` always receives an `id` and is never exercised with zero items here.
- The distinct-value fixture (`100` vs `7.5`, `2` vs `3`, different titles) is intentional — it prevents a builder that reuses one item's fields across all lines from passing.
