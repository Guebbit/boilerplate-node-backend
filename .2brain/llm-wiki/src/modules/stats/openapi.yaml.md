---
source: src/modules/stats/openapi.yaml
sha256: 2525cdb89df24dd03c612ab611eefd635c853d2a57ebbcbf1bfd8c3f900bce83
generated_at: 2026-11-08T08:24:53.486627+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **stats** module. It defines the read-only, staff-facing endpoints that expose sales figures, product/category/payment breakdowns, operational rates, customer segmentation, and a live pipeline snapshot. The file is the single source of truth for the module's request/response shapes and is consumed by code generators, clients, and API docs.

## Key elements

- **Paths (all `GET`, all require `bearerAuth` + `read:Stats`):**
  - `/stats/sales` – Headline totals, prior-period comparison, and per-bucket (day/week/month) series per currency.
  - `/stats/products` – Top-N products ranked by net sales in the period.
  - `/stats/products/{productId}` – Per-bucket units ordered / reversed for a single product.
  - `/stats/categories` – Net sales and units per category (frozen on the order line).
  - `/stats/payments` – Payment-method/provider mix with count and amount.
  - `/stats/operations` – Cancellation, return, and refund rates.
  - `/stats/customers` – New vs. returning customer counts for the period.
  - `/stats/pipeline` – Point-in-time snapshot of awaiting-money bank transfers and unshipped paid orders.

- **Shared components (defined locally):**
  - `StatsFromParam` / `StatsToParam` – Required `from`/`to` date-query parameters (shop-local, inclusive, ≤ 2 years apart).
  - `StatsIntervalParam` – Bucket granularity (day / week / month).
  - Schemas: `SalesStats`, `ProductStats`, `ProductSeries`, `CategoryStats`, `PaymentMix`, `OperationsStats`, `CustomerStats`, `PipelineStats`.

- **Tag:** `Stats` with `x-family: Running the shop`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – Every endpoint's error responses (`401 Unauthorized`, `403 Forbidden`, `422 ValidationError`, `404 NotFound`) and the `Id` schema used in `/stats/products/{productId}` are `$ref`'d from this shared contract. This file does not redefine those objects.

## Notes

- All endpoints carry `x-cache: private-no-cache`; nothing is served from a shared cache.
- Dates are **shop-local** (`NODE_SHOP_TIMEZONE`); bucket edges fall on local midnight, not UTC.
- Money is grouped by currency and **never converted**; figures are net of VAT unless stated otherwise.
- `from`/`to` must span ≤ 2 years **or** ≤ 400 buckets (whichever is tighter).
- Category rows intentionally do **not** sum to the grand total (a product in two categories is counted in both).
- Customer identity is matched by **account ID only**, never email, because erased accounts share a placeholder address.
- Product stats read frozen order lines; a deleted order silently drops out.
- `/stats/pipeline` is a snapshot (no date params), unlike every other endpoint in the file.
