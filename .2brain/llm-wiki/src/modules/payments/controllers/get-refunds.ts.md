---
source: src/modules/payments/controllers/get-refunds.ts
sha256: 8b8ba2d49bc2209ea9cc3bc69068791d454c0592c2b3faff14f5feb13b54ac43
generated_at: 2026-11-08T07:17:43.764874+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-refunds.ts

## Purpose

HTTP controller for `GET /payments/refunds`. It validates query-string parameters (pagination + optional filters) and delegates to `paymentService.listRefunds`, returning one row per refund for the Refunds tab in the UI.

## Key elements

- **`listRefundsQuerySchema`** — Zod schema built by extending `ListRefundsQueryParams` (from `@api/schemas.zod`) with `page` and `pageSize` fields. Used for request validation.
- **`getRefunds`** (exported) — A search-controller instance created via `createSearchController`. Its `runSearch` callback conditionally forwards only the filters that are present (status, reason, orderId, createdFrom, createdTo, page, pageSize) to `paymentService.listRefunds`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Imports `pageSchema` and `pageSizeSchema` for the pagination query parameters.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — Imports `createSearchController`, the factory that wires schema validation + search execution into a standard HTTP handler.
- **`src/modules/payments/services/index.ts`** — Imports `paymentService` and calls its `listRefunds` method inside `runSearch`.
- **`src/modules/payments/routes.ts`** — Expected consumer; registers `getRefunds` on the `GET /payments/refunds` route.

## Notes

- Date filters (`createdFrom`, `createdTo`) arrive as strings and are converted with `new Date(...)` before being passed to the service.
- All optional fields are conditionally spread (`parsed.x ? { x: … } : {}`) so that absent parameters are omitted from the service call rather than passed as `undefined` or empty strings.
- The `page` and `pageSize` values are typed as the raw query-string text (see the JSDoc on `listRefundsQuerySchema`), not pre-parsed integers.
