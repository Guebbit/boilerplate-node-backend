---
source: src/modules/stock-alerts/controllers/delete-stock-alert.ts
sha256: 70864356d160c04065c7ac108f97f673a0eb257c4f68c3c99ca946f17e51c9c0
generated_at: 2026-11-08T08:27:27.499612+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/controllers/delete-stock-alert.ts

## Purpose

Thin HTTP adapter that handles `DELETE /stock-alerts/:productId`. It validates the route parameter, delegates to `stockAlertService.cancel`, and maps the result (or rejection) onto the HTTP response. All business logic lives in the service; this file only translates between the Express request/response cycle and the service API.

## Key elements

- **`deleteStockAlert(request, response)`** — the sole export. Extracts `productId` via `requireId`, calls `stockAlertService.cancel(authContext.id, productId)`, then either returns a 200 `StockAlertsResponse`, a rejection (via `refused`), or an error (via `catchAs`).

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `productId` route param and short-circuits with a 404 if missing/invalid.
- **`src/infrastructure/http/response.ts`** — `successResponse` serializes the service result into a 200 JSON body.
- **`src/infrastructure/http/controller.ts`** — `catchAs` converts thrown/rejected errors into a standard error response; `refused` inspects the result to emit a 4xx when the service signals the caller does not own the alert.
- **`src/modules/stock-alerts/service.ts`** — provides `stockAlertService.cancel`, the actual "cancel a pending alert" operation.
- **`src/modules/stock-alerts/routes.ts`** — registers `deleteStockAlert` as the handler for the `DELETE /stock-alerts/:productId` route.
- **`src/types/index.ts`** — supplies the `StockAlertsResponse` type used to type the success payload.

## Notes

- Returns **200 with a body** (not 204) on successful cancellation; the body is a `StockAlertsResponse`.
- `request.authContext!` uses a non-null assertion — the controller assumes an upstream auth middleware has already populated `authContext`. If that middleware is bypassed, this will throw at runtime.
- The function returns `undefined` early when `requireId` fails (it has already written the error response), so the `.then/.catch` chain is only reached on the happy path.
