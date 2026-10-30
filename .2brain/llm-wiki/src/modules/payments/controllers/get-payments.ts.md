---
source: src/modules/payments/controllers/get-payments.ts
sha256: 935cb0d268b0746b65772ba714e8a2e1a9d2b4dc2a31783d18fa349de29c8562
generated_at: 2026-10-29T05:02:36.322705+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payments.ts

## Purpose

Defines the controller for `GET /payments` and `POST /payments/search` (the staff payments list). Both routes are served by a single controller instance produced through the shared search-controller factory, with a query-string-aware schema that coerces text inputs to their proper types.

## Key elements

- **`amountSchema`** — Zod schema that preprocesses blank values to `undefined` (i.e. "no filter"), then coerces to a non-negative number. Used for `amountMin` and `amountMax`.
- **`searchPaymentsQuerySchema`** — Extends the generated `SearchPaymentsBody` with transport-layer coercions: `page`, `pageSize`, both amount fields, and `disputed` all accept raw string input from query parameters.
- **`getPayments`** (exported) — The controller created via `createSearchController`. It validates the request against `searchPaymentsQuerySchema` and delegates to `paymentService.listPayments`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Provides the reusable coercion helpers (`blankToUndefined`, `optionalBooleanSchema`, `pageSchema`, `pageSizeSchema`) used to build the query schema.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — The factory that wraps validation + execution into a Hono-compatible handler. This file calls it with `entity`, `schema`, and `runSearch` options.
- **`src/modules/payments/routes.ts`** — Wires the exported `getPayments` controller onto the `GET /payments` and `POST /payments/search` routes.
- **`src/modules/payments/services/index.ts`** — Exports `paymentService`, whose `listPayments` method performs the actual data retrieval.

## Notes

- A single controller object handles **two different HTTP verbs/paths**. Consumers (routes file, tests, AI assistants) should not expect a separate function per endpoint.
- All numeric and boolean query params arrive as strings; the schema layer is responsible for coercion. Do not add a second validation pass in the service.
- `blankToUndefined` means an empty-string amount param is equivalent to omitting it — it is *not* a validation error.
