---
source: src/modules/stock-alerts/controllers/post-stock-alerts.ts
sha256: 3f37a6b21d835124656bb8dc46acdaf4f5d885bd99da2fd66e484c7383994c8d
generated_at: 2026-10-29T05:57:47.593407+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/controllers/post-stock-alerts.ts

## Purpose
Thin Express controller for `POST /stock-alerts`. Validates the incoming body, delegates to `stockAlertService.ask`, and serializes the result into an HTTP response. It contains no business logic.

## Key elements
- **`postStockAlerts`** (exported function) — the route handler. Parses the request body via `parseBody(CreateStockAlertBody, …)`, calls `stockAlertService.ask(userId, productId)`, and on success sends **200** with the full alert list (`StockAlertsResponse`). On refusal or error it delegates to `refused` / `catchAs`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — provides the `parseBody`, `refused`, and `catchAs` helpers used for input validation, domain-refusal mapping, and error catching.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 JSON reply.
- **`src/modules/stock-alerts/service.ts`** — the sole business-logic dependency; the controller calls `stockAlertService.ask`.
- **`src/modules/stock-alerts/routes.ts`** — registers `postStockAlerts` as the `POST /stock-alerts` handler.
- **`src/types/index.ts`** — supplies the `CreateStockAlertRequest` and `StockAlertsResponse` types used in the handler signature and response generic.

## Notes
- Returns **200** (not 201) with the *entire* alert list, because the list is the parent resource; a repeated request is the same request (idempotent by design).
- `request.authContext!.id` uses a non-null assertion — the auth middleware is expected to have run upstream; if it didn't, this throws a runtime error rather than a controlled 401.
- A `productId` that doesn't belong to this backend is rejected as **422** by `parseBody` before the service is ever called.
- The handler uses `.then()/.catch()` instead of `async/await`, consistent with the `catchAs` helper's promise-based design.
