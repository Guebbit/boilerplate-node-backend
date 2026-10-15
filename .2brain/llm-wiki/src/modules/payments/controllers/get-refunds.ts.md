---
source: src/modules/payments/controllers/get-refunds.ts
sha256: 8b8ba2d49bc2209ea9cc3bc69068791d454c0592c2b3faff14f5feb13b54ac43
generated_at: 2026-10-15T11:23:38.604977+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-refunds.ts

## Purpose

HTTP controller for `GET /payments/refunds`. Exposes a paginated, filterable list of one row per refund across all payments, serving the Refunds tab in the UI. It validates query-string parameters and delegates to the payment service.

## Key elements

- **`listRefundsQuerySchema`** — Extends the generated `ListRefundsQueryParams` (from `@api/schemas.zod`) with `page` and `pageSize` from the shared HTTP schemas. Used for request validation.
- **`getRefunds`** (exported) — The controller handler produced by `createSearchController`. Accepts the validated query, conditionally forwards each present filter to `paymentService.listRefunds`, and returns the result.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Provides the `createSearchController` factory that wires up validation, error handling, and the HTTP response envelope around the `runSearch` callback.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema`, the standard pagination validators reused across search controllers.
- **`src/modules/payments/services/index.ts`** — Source of `paymentService`; the `listRefunds` method is the actual data query this controller invokes.
- **`src/modules/payments/routes.ts`** — Imports `getRefunds` and registers it as the handler for the `GET /payments/refunds` route.

## Notes

- Every optional filter in `runSearch` is spread conditionally (`parsed.x ? { … } : {}`), so the service never receives `undefined` keys.
- `createdFrom` / `createdTo` arrive as query-string text and are converted to `Date` objects here, before reaching the service.
- `page` and `pageSize` are intentionally kept as strings at the schema level (per the inline comment); numeric coercion is left to the service layer.
