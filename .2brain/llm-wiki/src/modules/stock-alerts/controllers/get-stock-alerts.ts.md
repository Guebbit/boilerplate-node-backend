---
source: src/modules/stock-alerts/controllers/get-stock-alerts.ts
sha256: 68cb3c371fd1c160349e26894e20d9777c30bba7f0be9006269900871b09d0da
generated_at: 2026-10-29T05:57:39.498795+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/controllers/get-stock-alerts.ts

## Purpose

Thin HTTP adapter for the `GET /stock-alerts` endpoint. It extracts the caller's identity from the authenticated request, delegates to `stockAlertService.list`, and shapes the result into a standard JSON response. Exists so the service layer stays transport-agnostic.

## Key elements

- **`getStockAlerts(request, response)`** — The sole export. A one-line chain:
  1. Calls `stockAlertService.list(request.authContext!.id)`.
  2. On success, sends the view through `successResponse<StockAlertsResponse>`.
  3. On rejection, delegates to `catchAs(response, 'getStockAlerts')` for consistent error serialization.

## Relationships

- **`src/modules/stock-alerts/service.ts`** — Imports `stockAlertService`; the actual query logic lives there.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to format the 200 envelope.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` for the standard error-handling path (logs + 500 reply).
- **`src/types/index.ts`** — Imports `StockAlertsResponse` as the declared response type.
- **`src/modules/stock-alerts/routes.ts`** — Registers this handler on the `GET /stock-alerts` route (caller side, not imported here).

## Notes

- `request.authContext!.id` uses a non-null assertion; it assumes an auth middleware has already populated `authContext`. No guard exists in this file.
- The promise chain (`.then().catch()`) is deliberately fire-and-forget — there is no `await`, so the Express handler returns `undefined` immediately.
- The operation name passed to `catchAs` is the literal string `'getStockAlerts'`, used for log correlation.
