---
source: src/modules/payments/controllers/get-payments.ts
sha256: 3e2f41e2321c34ae529deaf326235a63b3ab32a9ab6cad1e2af9d8bfc9282f11
generated_at: 2026-11-08T07:17:27.682035+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payments.ts

## Purpose

Single controller that serves both `GET /payments` and `POST /payments/search` (the staff payments list). It defines a query-string-aware Zod schema on top of the generated API body schema and delegates the actual lookup to `paymentService.listPayments`, using the shared `createSearchController` factory to wire up parsing, validation, and response shaping in one place.

## Key elements

- **`searchPaymentsQuerySchema`** – Extends the generated `SearchPaymentsBody` (from `@api/schemas.zod`) with transport-level coercions needed when the same fields arrive as query-string text: `page`/`pageSize` become integers, `amountMin`/`amountMax` get a `blankToUndefined` preprocess step, and `disputed` becomes an optional boolean.
- **`getPayments`** (export) – The controller instance produced by `createSearchController({ entity: 'payments', schema, runSearch })`. `runSearch` calls `paymentService.listPayments(parsed, request.authContext)`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** – Supplies `blankToUndefined`, `optionalBooleanSchema`, `pageSchema`, and `pageSizeSchema`, all imported to build `searchPaymentsQuerySchema`.
- **`src/infrastructure/surfaces/create-search-controller.ts`** – Provides the `createSearchController` factory; this file is a thin configuration call into it.
- **`src/modules/payments/routes.ts`** – Mounts `getPayments` on the `/payments` and `/payments/search` routes (the consumer of this export).
- **`src/modules/payments/services/index.ts`** – Exports `paymentService`, whose `listPayments` method is the business-logic target invoked by `runSearch`.

## Notes

- Two different HTTP verbs/paths are served by **one** exported handler (`getPayments`). The `createSearchController` factory abstracts away the verb/path difference; adding a third spelling would mean adding another route registration, not a new controller.
- The query schema deliberately **extends** the generated `SearchPaymentsBody` rather than redefining fields, so the API contract (from `@api/schemas.zod`) stays the single source of truth for field names and types.
- `blankToUndefined` on the amount fields means `?amountMin=` (empty value) is treated as "no filter" instead of producing a Zod parse error—relevant when building URLs by hand or with a query-string library that emits empty keys.
