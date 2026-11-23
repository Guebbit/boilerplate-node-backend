---
source: src/modules/stock-alerts/controllers/get-stock-alerts.ts
source_sha256: 68cb3c371fd1c160349e26894e20d9777c30bba7f0be9006269900871b09d0da
context_sha256: 84d17b8619d62c8aa465fb04b3f78f76d914153ab3a18ee33ec869df1714b632
generated_at: 2026-11-22T07:53:49.651270+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/controllers/get-stock-alerts.ts

## Purpose
Express controller for `GET /stock-alerts`. It is a thin HTTP adapter: it asks `stockAlertService.list` for the authenticated caller's own stock-alert requests (newest first, per the doc comment) and sends the result as a success response.

## Key elements
- `getStockAlerts(request, response)` — the only export. Calls `stockAlertService.list(request.authContext!.id)`. On success it passes the returned view to `successResponse<StockAlertsResponse>(response, view)`. On failure it delegates to `catchAs(response, 'getStockAlerts')`.

## Relationships
- `src/modules/stock-alerts/service.ts` — exports `stockAlertService`, whose `list` method does the actual work. The controller adds no logic of its own.
- `src/infrastructure/http/response.ts` — provides `successResponse`, which writes the success payload.
- `src/infrastructure/http/controller.ts` — provides `catchAs`, which builds the error handler for the promise chain. The `'getStockAlerts'` label identifies this controller.
- `src/types/index.ts` — provides the `StockAlertsResponse` type (imported via the `@types` alias) used to type the response payload.
- `src/modules/stock-alerts/routes.ts` — the route module that wires up this handler for `GET /stock-alerts`.

## Notes
- `request.authContext!` uses a non-null assertion. The handler assumes authentication middleware has already populated `authContext`, and it does not check this itself.
- Errors are handled through a promise `.catch`, not `async`/`await` or `try`/`catch`.
- Imports use the `@infrastructure/...` and `@types` path aliases. `../service` is a relative import.
