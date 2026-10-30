---
source: src/modules/stock-alerts/controllers/delete-stock-alert.ts
sha256: 70864356d160c04065c7ac108f97f673a0eb257c4f68c3c99ca946f17e51c9c0
generated_at: 2026-10-29T05:57:31.649240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/controllers/delete-stock-alert.ts

## Purpose

Thin HTTP adapter that handles `DELETE /stock-alerts/:productId`. It validates the `productId` path parameter, delegates to `stockAlertService.cancel` scoped to the authenticated caller, and formats the resulting HTTP response.

## Key elements

- **`deleteStockAlert`** (exported const) — The sole controller handler. Reads `productId` from the route params via `requireId`, invokes `stockAlertService.cancel(authContext.id, productId)`, then either sends a 200 with `StockAlertsResponse` payload (`successResponse`) or short-circuits through `refused`. Errors are funneled to `catchAs`.

## Relationships

- **`src/modules/stock-alerts/routes.ts`** — Registers this handler on the `DELETE /stock-alerts/:productId` route.
- **`src/modules/stock-alerts/service.ts`** — Provides `stockAlertService.cancel`, the domain operation this controller wraps.
- **`src/infrastructure/http/controller.ts`** — Supplies the `catchAs` and `refused` helpers for uniform error/refusal handling.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` to extract and validate the `productId` path param.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` to emit the standard 200 JSON envelope.
- **`src/types/index.ts`** — Provides the `StockAlertsResponse` type used as the generic in `successResponse`.

## Notes

- The handler does **not** check ownership beyond passing `authContext.id` into `cancel`; any "not yours" refusal is expected to come back from the service layer via the `refused` check.
- Uses a `.then/.catch` chain rather than `async/await`; `catchAs` is the single error sink.
- `request.authContext!` uses a non-null assertion — the auth middleware is assumed to run before this handler (enforced elsewhere in the route setup).
