---
source: src/modules/stock-alerts/controllers/delete-stock-alert.ts
source_sha256: 70864356d160c04065c7ac108f97f673a0eb257c4f68c3c99ca946f17e51c9c0
context_sha256: 0ae8462d46e5d7cbce17c8a6695639662510a78d762a5e6f228a34307c5c2e41
generated_at: 2026-11-22T07:53:40.385120+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/controllers/delete-stock-alert.ts

## Purpose
Express controller for `DELETE /stock-alerts/:productId`. It is a thin HTTP adapter that lets the authenticated caller cancel their own stock-alert request before it has been answered, delegating the work to `stockAlertService.cancel`.

## Key elements
- `deleteStockAlert(request, response)` — the only export. Flow:
  1. Validates `productId` from the route params with `requireId`, using the `stock-alerts.not-found` message key. If validation fails it returns early, since `requireId` has already handled the response.
  2. Calls `stockAlertService.cancel(request.authContext!.id, productId)`.
  3. If `refused(response, result)` is true, it returns without further action. Otherwise it sends `successResponse<StockAlertsResponse>(response, result.data, 200)`.
  4. Any rejection goes to `catchAs(response, 'deleteStockAlert')`.

## Relationships
- `src/infrastructure/http/ids.ts` — `requireId` parses and validates the `productId` param.
- `src/infrastructure/http/response.ts` — `successResponse` builds the 200 reply.
- `src/infrastructure/http/controller.ts` — `refused` handles service-level refusal results, and `catchAs` handles thrown errors.
- `src/modules/stock-alerts/service.ts` — provides `stockAlertService`, whose `cancel` method performs the cancellation.
- `src/types/index.ts` — supplies the `StockAlertsResponse` type for the success payload.
- `src/modules/stock-alerts/routes.ts` — the route definition that this controller is attached to for `DELETE /stock-alerts/:productId`.

## Notes
- It reads `request.authContext!.id` with a non-null assertion. It therefore assumes an auth middleware has populated `authContext` before this handler runs.
- The service is passed only the caller's id and the `productId`, which scopes the cancellation to the caller's own request.
- The handler returns early without a value when `requireId` or `refused` has already responded.
