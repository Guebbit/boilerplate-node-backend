---
source: src/modules/orders/openapi.yaml
sha256: f8ee429b80aff2e8a7c6bdf84c426344891da251e7a653ee44064bf035e76d4d
generated_at: 2026-10-29T04:43:38.619488+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the orders module. It declares the HTTP surface (list, create, delete, and other order-lifecycle endpoints), the module-specific error codes, and the orders' contribution to the account data export. Serves as the single source of truth for what the orders API exposes, how callers filter and sort, and what failure modes are guaranteed.

## Key elements

- **`x-error-codes`** — Machine-readable catalogue of order-specific errors (e.g. `ORDER_INSUFFICIENT_STOCK`, `ORDER_PRODUCT_UNAVAILABLE`, `ORDER_INVOICED`, `ORDER_HAS_MONEY_HISTORY`, `ORDER_OVERRIDE_AWAITING_STOCK`), each with its HTTP status and the shape of `errors[].details`.
- **`x-personal-data`** — Declares the `orders` and `orderTimeline` sections that the export bundler appends to `POST /account/export`; removing the module removes these sections.
- **`GET /orders`** — Paginated list with rich filtering (status, fulfillmentStatus, paymentStatus, paymentMethod, returnStatus, date ranges, `deleted` flag). Permission model: `read:Order` scopes to own orders; `display:Order` lifts that restriction and enables the `userId` filter.
- **`POST /orders`** — Admin/self order creation. Enforces stock availability, product soft-deletion, and a two-layer line-count/quantity cap (schema-level 1000 × 999 999, deployment-level via `NODE_ADMIN_ORDER_MAX_LINES` / `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY`). Supports `Idempotency-Key`.
- **`DELETE /orders`** (and the `{id}` alias) — Soft or hard delete. Hard delete requires a cancelled order with no post-cancel money history; soft delete hides from the buyer and is reversible via `POST /orders/{id}/restore`. The `hardDelete` flag is read from query, body, or path on whichever route is mounted.
- **Shared parameter/schema `$ref`s** into `../../../shared/contracts/openapi.root.yaml` for pagination, idempotency, standard error responses, and value types (Email, IdParam, etc.).

## Relationships

- **`src/modules/orders/module.yaml`** — The module manifest that this OpenAPI spec belongs to; `module.yaml` declares the module's metadata and points to this file as its contract.
- **`src/modules/payments/module.ts`** — Implements payment capture, invoicing, and refunds that the orders contract references (e.g. `ORDER_INVOICED`, `ORDER_HAS_MONEY_HISTORY`, the "refunds a paid one" behaviour on cancel). The orders spec assumes payment status transitions produced by the payments module.
- **`src/modules/observability/openapi.yaml`** — Sibling module contract in the same monorepo structure; shares the same `openapi.root.yaml` base and the same `x-error-codes` / `x-personal-data` extension conventions, but defines no order-specific operations.

## Notes

- The `deleted` query parameter is admin-effective: a caller without permission to see soft-deleted rows gets an empty page for `deleted=true` rather than an error.
- `x-alias-of` (e.g. on `DELETE /orders`) links two routes served by the same controller; the `hardDelete` flag is unified across them, but the `id` source differs (body vs. path).
- The `orderTimeline` export intentionally includes staff reasons (the buyer's data, not the buyer's screen), while the writing staff member's identity stays in the audit log per CJEU Pankki S (C-579/21).
- Sort uses JSON:API grammar (`?sort=-price,title`), not the more common `sort=field,dir` pair.
