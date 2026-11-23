---
source: src/modules/stock-alerts/presenter.ts
source_sha256: d83132e658d2d43d4b75fab2d054aa6c890164009d23be0e4452eb6dff644c76
context_sha256: e26b3a1561b79a2480e2674becdbd7f99cedd0f0b9dca0ecb7d921493b5b6791
generated_at: 2026-11-22T07:55:07.515014+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/presenter.ts

## Purpose
Converts stored stock-alert documents into the response shape declared by `openapi.yaml`. The response is built field by field rather than serialized from the document, so fields the contract does not name cannot leak to clients.

## Key elements
- `presentStockAlerts(alerts)`: takes a readonly array of `StockAlertDocument` and returns a `StockAlertsResponse` of the form `{ items: [{ productId, createdAt }] }`.
  - `productId` is converted with `String(...)`.
  - `createdAt` is output as an ISO string. If `createdAt` is missing, it falls back to `new Date(0)`, which gives `1970-01-01T00:00:00.000Z`.

## Relationships
- `./model`: imports the `StockAlertDocument` type, which is the input element type.
- `@types` (`src/types/index.ts`): imports the `StockAlertsResponse` type, which is the return type.
- `service.ts` is a graph neighbor, but this file doesn't import it or reference it in its code. Any use of the presenter by the service is not visible here.

## Notes
- The doc comment says "newest first", but the function does not sort. It maps the input in the order given, so ordering must be done by the caller.
- Only `productId` and `createdAt` are exposed. Any new field must be added explicitly here and in `openapi.yaml`.
- The epoch fallback for a missing `createdAt` hides missing data instead of raising an error.
