---
source: src/modules/stock-alerts/presenter.ts
sha256: d83132e658d2d43d4b75fab2d054aa6c890164009d23be0e4452eb6dff644c76
generated_at: 2026-11-08T08:29:12.541588+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/presenter.ts

## Purpose
Transforms internal `StockAlertDocument` records into the exact wire shape declared in `openapi.yaml`. The response object is constructed field-by-field rather than serialized from the model, so any field absent from the contract can never leak to the client.

## Key elements
- **`presentStockAlerts`** (exported const) — Pure function that maps a read-only array of `StockAlertDocument` into a `StockAlertsResponse`. For each alert it emits `productId` (coerced to `string`) and `createdAt` (ISO-8601 string, falling back to epoch `0` if the document lacks the field).

## Relationships
- **`src/types/index.ts`** — Imports the `StockAlertsResponse` type that defines the output shape.
- **`src/modules/stock-alerts/model.ts`** — Imports the `StockAlertDocument` type that defines the input shape.
- **`src/modules/stock-alerts/service.ts`** — Expected caller: the service layer invokes `presentStockAlerts` to produce the HTTP response body before it is returned to the transport layer.

## Notes
- The `productId` cast via `String(...)` implies the model may store it as a numeric or ObjectId-like value; the contract expects a string.
- The `createdAt ?? new Date(0)` guard means a missing date is reported as `1970-01-01T00:00:00.000Z` rather than `null` or omitted. If callers need to distinguish "no date" from "epoch," this function will not help.
- Because the object is hand-built (not spread from the document), adding a new field to `StockAlertDocument` is invisible to the client until an explicit mapping is added here.
