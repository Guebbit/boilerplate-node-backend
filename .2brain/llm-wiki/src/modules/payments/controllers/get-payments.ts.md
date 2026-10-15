---
source: src/modules/payments/controllers/get-payments.ts
sha256: a650a22b39fc8024e8ee3711cdd10a8712cf9047ce9d642dce338afe32cbf38e
generated_at: 2026-10-15T11:23:30.442225+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payments.ts

## Purpose

Defines a single controller (`getPayments`) that serves both `GET /payments` and `POST /payments/search`, delegating the actual work to `paymentService.listPayments`. The controller exists to translate raw HTTP query/body parameters (text strings) into validated, typed search criteria before handing them to the service layer.

## Key elements

- **`amountSchema`** — Zod schema that preprocesses blank strings to `undefined` (no filter), then coerces to `number` with `min(0)`, marked `.optional()`. Used for both `amountMin` and `amountMax`.
- **`searchPaymentsQuerySchema`** — Extends the generated `SearchPaymentsBody` (from `@api/schemas.zod`) with transport-level coercions: `page`, `pageSize`, `amountMin`, and `amountMax` all arrive as text in query strings.
- **`getPayments`** (exported) — The controller object produced by `createSearchController`. Configured with entity name `'payments'`, the schema above, and a `runSearch` callback that calls `paymentService.listPayments(parsed, request.authContext)`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Provides `blankToUndefined`, `pageSchema`, and `pageSizeSchema` utilities used to build the query schema.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — The factory that wraps validation + search execution into a routable controller; `getPayments` is its direct output.
- **`src/modules/payments/routes.ts`** — Registers `getPayments` on the router for the `GET /payments` and `POST /payments/search` paths.
- **`src/modules/payments/services/index.ts`** — Exports `paymentService`, whose `listPayments` method is invoked as the `runSearch` handler.

## Notes

- A single controller instance handles both the `GET` (query params) and `POST` (JSON body) spellings of the same search; no separate handlers are needed.
- Amounts and page fields are strings on the wire; the schemas coerce them. Forgetting the `.optional()` or the `blankToUndefined` preprocess would turn an empty filter field into a validation error instead of "no filter."
- The base `SearchPaymentsBody` is imported from a generated schema (`@api/schemas.zod`); this file only layers on the HTTP-transport coercions, so field names and types are owned by the API contract, not here.
