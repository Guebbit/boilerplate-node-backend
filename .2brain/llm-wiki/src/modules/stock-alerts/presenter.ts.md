---
source: src/modules/stock-alerts/presenter.ts
sha256: d83132e658d2d43d4b75fab2d054aa6c890164009d23be0e4452eb6dff644c76
generated_at: 2026-10-29T05:58:57.181230+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/presenter.ts

## Purpose

Transforms stored `StockAlertDocument` records into the exact wire shape declared by the OpenAPI contract (`StockAlertsResponse`). The output object is built field-by-field rather than serialized from the document, guaranteeing that any field absent from the contract cannot leak into the response.

## Key elements

- **`presentStockAlerts(alerts: readonly StockAlertDocument[]): StockAlertsResponse`** — The sole export. Maps each document to `{ productId: string, createdAt: string }`, stringifying `productId` and converting `createdAt` to an ISO-8601 string (falling back to epoch `0` if `null`/`undefined`). Returns `{ items: [...] }` matching the contract's top-level envelope.

## Relationships

- **`src/modules/stock-alerts/model.ts`** — Source of the `StockAlertDocument` input type. The presenter is the boundary between this internal document shape and the external API contract.
- **`src/types/index.ts`** — Source of the `StockAlertsResponse` output type (the `openapi.yaml`-derived contract shape).
- **`src/modules/stock-alerts/service.ts`** — Upstream caller; orchestrates fetching documents from the model layer and passes them through this presenter before returning a response.

## Notes

- The `productId` is coerced with `String(...)`, implying the model may store it as a number or other type. The contract requires a string.
- `createdAt` defaults to `new Date(0)` (1970-01-01T00:00:00.000Z) when the document carries a nullish value — a defensive guard, not a business-logic default.
- Because the function constructs a fresh object literal, it is intentionally **not** a spread/copy of the document. This is a deliberate safety measure, not a style choice.
