---
source: src/modules/stock-alerts/controllers/get-stock-alerts.ts
sha256: 68cb3c371fd1c160349e26894e20d9777c30bba7f0be9006269900871b09d0da
generated_at: 2026-11-08T08:27:34.803048+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/controllers/get-stock-alerts.ts

## Purpose

Thin HTTP controller that handles `GET /stock-alerts`. It extracts the authenticated user's ID, delegates to `stockAlertService.list`, and returns the result (or a standardized error) via the shared response helpers. No business logic lives here.

## Key elements

- **`getStockAlerts(request, response)`** — The sole export. Reads `request.authContext!.id`, calls `stockAlertService.list(id)`, and responds with `successResponse<StockAlertsResponse>` on success or `catchAs(response, 'getStockAlerts')` on failure.

## Relationships

- **`src/modules/stock-alerts/service.ts`** — Calls `stockAlertService.list(userId)` to fetch the caller's alerts, newest first.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to wrap the view model into the standard HTTP envelope.
- **`src/infrastructure/http/controller.ts`** — Uses `catchAs` to convert thrown/rejected errors into a uniform error response tagged with the handler name.
- **`src/modules/stock-alerts/routes.ts`** — Registers `getStockAlerts` as the handler for the `GET /stock-alerts` route.
- **`src/types/index.ts`** — Imports the `StockAlertsResponse` type used to type the success payload.

## Notes

- `request.authContext!.id` uses a non-null assertion; the handler assumes an auth middleware has already populated `authContext` before routing reaches it.
- The handler is written in promise-chain style (`.then`/`.catch`) rather than `async`/`await`, consistent with the `catchAs` helper's expected signature.
- The file exports a plain function (not a class method); no instantiation or DI wiring is required beyond the single `stockAlertService` import.
