---
source: src/modules/stats/openapi.yaml
sha256: e80486761076c7dd60b10f135a4391562907bd4e24a31411e88f629350e69437
generated_at: 2026-11-14T22:01:39.144618+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **stats** module: the set of read-only, staff-facing endpoints that expose sales, product, category, payment, operations, customer, and pipeline figures for the staff dashboard. It defines the request/response shapes so clients and the implementing service stay in sync without either side reading the other's source.

## Key elements

- **`/stats/sales`** (`getSalesStats`) — Headline totals, prior-period comparison, and per-bucket (day / Monday-week / month) series per currency. Parameters: `from`, `to`, and `StatsIntervalParam`.
- **`/stats/products`** (`getProductStats`) — Top-N products ranked by net sales (units ordered minus units reversed). Accepts a `limit` (1–100, default 10).
- **`/stats/products/{productId}`** (`getProductSalesSeries`) — Per-bucket units ordered and reversed for a single product, plus its frozen title.
- **`/stats/categories`** (`getCategoryStats`) — Net sales and units per category (from the categories each order line froze).
- **`/stats/payments`** (`getPaymentMixStats`) — Payment count and amount grouped by method and provider for succeeded payments in the period.
- **`/stats/operations`** (`getOperationsStats`) — Cancellation rate (cohort), return rate, and refund rate.
- **`/stats/customers`** (`getCustomerStats`) — New vs. returning customer counts (matched by account, not email).
- **`/stats/pipeline`** (`getPipelineStats`) — Point-in-time snapshot: bank transfers awaiting funds and paid-but-unshipped orders. No `from`/`to` params.
- **`components.parameters`** — Shared `StatsFromParam`, `StatsToParam`, `StatsIntervalParam` reused across period-based endpoints.
- **`components.schemas`** — `SalesStats`, `ProductStats`, `ProductSeries`, `CategoryStats`, `PaymentMix`, `OperationsStats`, `CustomerStats`, `PipelineStats` (definitions truncated in the source).
- **`tags`** — Single `Stats` tag with `x-family: Running the shop`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All standard error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`) and the `Id` schema are `$ref`'d from this file, so error shapes and the product-ID type are defined once at the root level and reused here.

## Notes

- Every operation is marked `x-cache: private-no-cache` — no intermediary may cache these responses.
- All endpoints require the `read:Stats` bearer scope; there are no write or admin operations in this module.
- Amounts are grouped by currency and **never converted**; figures are net of VAT unless stated otherwise.
- All date parameters and bucket edges are **shop-local** (`NODE_SHOP_TIMEZONE`), not UTC.
- Period range is capped at **731 days / 400 buckets** to bound query cost.
- Category rows intentionally **do not sum to the total** (a product in two categories appears in both).
- Customer identity is matched by **account only**; email is never used because erased accounts share a placeholder address.
- `/stats/pipeline` is a **snapshot** (no date range), unlike every other endpoint in the module.
