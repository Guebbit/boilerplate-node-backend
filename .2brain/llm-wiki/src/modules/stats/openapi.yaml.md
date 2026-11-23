---
source: src/modules/stats/openapi.yaml
source_sha256: e80486761076c7dd60b10f135a4391562907bd4e24a31411e88f629350e69437
context_sha256: 7f3aba86ac2efd0d4afe36d962f2b90d926a48df14042f45873919e465614311
generated_at: 2026-11-22T07:51:33.899347+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (v0.1.0) for the `stats` module. It defines read-only, staff-facing sales and operations reporting endpoints, all tagged `Stats` (family "Running the shop"). The figures are computed on demand from the modules that own the underlying data.

## Key elements
All operations are `GET`, require `bearerAuth` with scope `read:Stats`, are marked `x-cache: private-no-cache`, and reference shared `Unauthorized`/`Forbidden` responses. All except `/stats/pipeline` also reference `ValidationError`.

- `/stats/sales` (`getSalesStats`): headline totals, the same totals for the equal-length prior period, and per-currency buckets by day, week (Monday) or month. The range may not pass 731 days or 400 buckets.
- `/stats/products` (`getProductStats`): top products by net sales, with units ordered, units reversed, net units and net sales. It takes a `limit` query parameter (1–100, default 10).
- `/stats/products/{productId}` (`getProductSalesSeries`): per-bucket units ordered and reversed for one product, plus its frozen title. It also returns `404`. `productId` uses the shared `Id` schema.
- `/stats/categories` (`getCategoryStats`): net sales and units per category.
- `/stats/payments` (`getPaymentMixStats`): succeeded payments by method and provider, with count and amount.
- `/stats/operations` (`getOperationsStats`): cancellation, return and refund rates.
- `/stats/customers` (`getCustomerStats`): new versus returning paying customers.
- `/stats/pipeline` (`getPipelineStats`): a snapshot with no period or parameters. It covers bank transfers awaiting money and paid orders not yet shipped.
- Shared parameters in `components.parameters`: `StatsFromParam` and `StatsToParam` (required, shop-local calendar dates, inclusive) and `StatsIntervalParam`.
- Response schemas referenced from `components/schemas`: `SalesStats`, `ProductStats`, `ProductSeries`, `CategoryStats`, `PaymentMix`, `OperationsStats`, `CustomerStats`, `PipelineStats`.

## Relationships
- `src/modules/stats/authorization.yaml` is the neighbor file. This contract's operations require the `read:Stats` scope under `bearerAuth`, which is presumably defined and granted there.
- The contract also uses `$ref`s to a shared root contract for the common error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`) and the `Id` schema.
- `/stats/products/{productId}` points to `GET /orders?productId=…&paidFrom=…`, which belongs to a different module, for the orders behind a product's figures.

## Notes
- Money is net of VAT unless stated otherwise. It is grouped by currency and never converted.
- A sale is dated by `paidAt`. A reversal is dated by the credit note's `issuedAt`.
- Days are shop-local, using `NODE_SHOP_TIMEZONE`. Bucket edges fall at shop-local midnight.
- Product and category stats read order lines as they were frozen, so a deleted order drops out.
- A product in several categories counts in each, so category rows do not sum to the total.
- The customer split matches by account only, never by email, because erased accounts share one placeholder address.
- The refund rate is credit notes ÷ invoices, VAT included. The return rate is units returned ÷ units ordered.
- Responses are never cached because they are the shop's money.
