---
source: src/modules/stock-alerts/controllers/post-stock-alerts.ts
sha256: 3f37a6b21d835124656bb8dc46acdaf4f5d885bd99da2fd66e484c7383994c8d
generated_at: 2026-11-08T08:27:44.819079+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/controllers/post-stock-alerts.ts

## Purpose

Thin HTTP adapter that handles `POST /stock-alerts`. It validates the request body, delegates to `stockAlertService.ask`, and returns **200** with the full stock-alerts list. Because the endpoint is idempotent (repeating the request is the same request), it intentionally uses 200 rather than 201.

## Key elements

- **`postStockAlerts`** (exported const) — the sole controller handler. Accepts `Request<unknown, unknown, CreateStockAlertRequest>` and `Response`.
  1. Validates `request.body` against `CreateStockAlertBody` (Zod schema from `@api/schemas.zod`) via `parseBody`; returns early on 422.
  2. Calls `stockAlertService.ask(request.authContext!.id, body.productId)`.
  3. On success: `successResponse<StockAlertsResponse>(response, result.data, 200)`.
  4. On refusal: short-circuits via `refused(response, result)`.
  5. On unhandled error: `catchAs(response, 'createStockAlert')`.

## Relationships

- **`src/modules/stock-alerts/service.ts`** — imports `stockAlertService` and calls its `.ask(userId, productId)` method; this file owns the HTTP boundary while the service owns the business logic.
- **`src/infrastructure/http/controller.ts`** — provides `parseBody`, `refused`, and `catchAs`, the shared validation / error-handling helpers used here.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the standard JSON success envelope.
- **`src/types/index.ts`** — supplies the `CreateStockAlertRequest` and `StockAlertsResponse` types that shape the function's generics.
- **`src/modules/stock-alerts/routes.ts`** — registers `postStockAlerts` as the handler for the `POST /stock-alerts` route.

## Notes

- **200, not 201.** The file's doc comment makes this explicit: the response is the *whole list*, so the operation is a repeatable "ask" rather than a one-shot create. Do not "fix" the status code to 201.
- **`request.authContext!`** uses a non-null assertion; the auth middleware is expected to have populated it before the handler runs.
- **`parseBody` rejects unknown `productId`s** (422) before any service call is made, acting as a guard against cross-backend product IDs.
