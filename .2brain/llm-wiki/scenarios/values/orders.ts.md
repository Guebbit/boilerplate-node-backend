---
source: scenarios/values/orders.ts
source_sha256: dc903f7b331b1633c2c04e1107cf8270179141f5da0b64841bd002ed119566f6
context_sha256: 3710050abb21d2e719759f008be1c9ee8c969ab5db51a38be9eb6c242d87068b
generated_at: 2026-11-22T01:50:13.397554+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/values/orders.ts

## Purpose
Supplies the `orders` example values for the generated API client collections (Bruno). Order ids can't be literals because the demo shop's orders come from real checkouts and get new ids every time the shop is built. So this file emits a `{{orderId}}` collection-variable placeholder instead of an id that would 404. Per the file's doc comment, the orders section's own first probe fills that variable.

## Key elements
- `ORDER_ID_VARIABLE` (private): the string `'{{orderId}}'`, used wherever an order id belongs in a generated request.
- `collectionValues` (exported, typed `CollectionValues`):
  - `byProperty`: maps the property name `orderId` to the placeholder.
  - `pathParam(name, template)`: returns the placeholder when the param is named `id` and the path template starts with `/orders`. Otherwise it returns `undefined`.
  - `tokens`: defines `seedOrderId`, which maps to `{{orderId}}`, and `seedDeletedOrderId`, which maps to `{{deletedOrderId}}`.

## Relationships
- Imports the `CollectionValues` type from `scenarios/collection-values.ts` (type-only import) and conforms to that shape. It has no runtime dependency on that file.

## Notes
- The `seedDeletedOrderId` token uses a separate `{{deletedOrderId}}` variable, not the `orderId` one. Nothing in this file says where that variable gets filled.
- The `pathParam` match is a prefix check (`startsWith('/orders')`), so it applies to any template beginning with `/orders`, not just exact order routes. It only applies to params named `id`.
