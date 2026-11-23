---
source: src/modules/stock-alerts/controllers/post-stock-alerts.ts
source_sha256: 3f37a6b21d835124656bb8dc46acdaf4f5d885bd99da2fd66e484c7383994c8d
context_sha256: 84d17b8619d62c8aa465fb04b3f78f76d914153ab3a18ee33ec869df1714b632
generated_at: 2026-11-22T07:53:59.868270+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/controllers/post-stock-alerts.ts

## Purpose
Express controller for `POST /stock-alerts`. It is a thin HTTP adapter: it validates the request body, delegates to the stock alert service's `ask` method, and returns the resulting stock-alert list. It lets an authenticated user ask to be notified when a product can be ordered again.

## Key elements
- `postStockAlerts(request, response)` is the only export, an Express handler typed with `CreateStockAlertRequest` as the body.
  - Parses the body with `parseBody(CreateStockAlertBody, ...)` and returns early if parsing fails. `parseBody` has already written the error response by then. Per the inline comment, a `productId` that is not this backend's id gets a 422.
  - Calls `stockAlertService.ask(request.authContext!.id, body.productId)`.
  - If `refused(response, result)` handles the result, the handler returns without writing anything further.
  - Otherwise it sends `successResponse<StockAlertsResponse>(response, result.data, 200)`.
  - Rejected promises go to `catchAs(response, 'createStockAlert')`.

## Relationships
- `src/infrastructure/http/controller.ts` provides `parseBody`, `refused` and `catchAs`, which handle validation, refusal results and error mapping.
- `src/infrastructure/http/response.ts` provides `successResponse`, which sends the 200 response.
- `src/modules/stock-alerts/service.ts` provides `stockAlertService`, whose `ask` method holds the business logic.
- `src/modules/stock-alerts/routes.ts` presumably mounts this handler on `POST /stock-alerts`.
- `src/types/index.ts` (imported as `@types`) supplies `CreateStockAlertRequest` and `StockAlertsResponse`.

## Notes
- The endpoint returns 200 with the whole alert list, not 201 with the created item. The doc comment gives the reason: the parent resource is the list, and repeating the request is the same request, so it is idempotent.
- `request.authContext!` is non-null asserted, so the route must run behind authentication middleware that sets `authContext`.
- The body schema `CreateStockAlertBody` is imported from `@api/schemas.zod`.
