---
source: src/modules/payments/controllers/get-refunds.ts
source_sha256: 8b8ba2d49bc2209ea9cc3bc69068791d454c0592c2b3faff14f5feb13b54ac43
context_sha256: 37b707e9690922879ae5bf1a63a26c3b28ef954f7c9842798c337f479e6f5d8b
generated_at: 2026-11-22T06:41:36.602841+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/get-refunds.ts

## Purpose
Controller for `GET /payments/refunds`, which returns one row per refund across all payments (used by the Refunds tab). It validates the query string and delegates the search to the payment service.

## Key elements
- `listRefundsQuerySchema` (module-private): the generated `ListRefundsQueryParams` schema (imported from `@api/schemas.zod`), extended so `page` and `pageSize` use `pageSchema` / `pageSizeSchema`, which parse them as query-string text.
- `getRefunds` (exported): a controller built with `createSearchController`, using `entity: 'refunds'`, the schema above, and a `runSearch` callback.
- `runSearch`: calls `paymentService.listRefunds` with only the filters that were provided. The supported filters are `status`, `reason`, `orderId`, `createdFrom`, `createdTo`, `page` and `pageSize`. `createdFrom` and `createdTo` are converted to `Date` objects.

## Relationships
- `src/infrastructure/http/schemas.ts`: provides `pageSchema` and `pageSizeSchema`, used to override pagination parsing.
- `src/infrastructure/surfaces/create-search-controller.ts`: provides `createSearchController`, which builds the controller from the entity name, schema and search function.
- `src/modules/payments/services/index.ts`: provides `paymentService`, whose `listRefunds` does the actual lookup.
- `src/modules/payments/routes.ts`: the neighbor that wires up the `getRefunds` handler. The file itself doesn't show how.

## Notes
- Falsy values are omitted. Each filter is spread in only if truthy, so absent or empty-string params are never passed to the service.
- `createdFrom` and `createdTo` are passed as `Date` objects. No extra validation is visible here, so any date validation comes from the generated schema.
