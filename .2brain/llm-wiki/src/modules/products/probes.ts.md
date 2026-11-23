---
source: src/modules/products/probes.ts
source_sha256: b55751c7a734446e62a3126fb2a46547dcf2bf823cda9eb93cece736ea267093
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T07:11:32.913766+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/probes.ts

## Purpose
Defines the products module's "probes": hand-written HTTP requests for cases the OpenAPI contract cannot describe (invalid payloads, headers applied globally, optional query filters, visibility edge cases). The header defers to `scripts/contracts/client-collections-bundle.ts` for what a probe is, where probes are emitted, and which `{{seedToken}}` placeholders they may use.

## Key elements
- `probes: Probe[]` — the only export. Each entry has a `name`, a `why` explaining what to observe, and the request (`method`, `path`, optionally `auth`, `headers`, `body`). The `Probe` type comes from `@guebbit/openapi-runnable-collections`.
  - **422 validation** — `POST /products` with `bearer` auth and a body with an empty title and `price: -1`; compare the `errors[]` entries with the fields sent.
  - **Italian locale** — `GET /products/{{seedProductId}}` with `Accept-Language: it`; diff `message` against the generated request.
  - **All optional filters** — `GET /products?page=1&pageSize=5&priceMin=1&priceMax=100&active=true`.
  - **Soft-deleted product** — `GET /products/{{seedSoftDeletedProductId}}`, anonymous; expected 404 for anonymous callers, while an admin should get the record.
  - **Inactive product** — `GET /products/{{seedInactiveProductId}}`, anonymous; `active: false` is distinct from a set `deletedAt`.
  - **Off-sale product** — `GET /products/{{seedOffSaleProductId}}`, anonymous; `purchasable: false` still lists the product, whereas `active: false` answers 404.

## Relationships
No graph neighbors. The only import is the `Probe` type from the external package `@guebbit/openapi-runnable-collections`.

## Notes
- Seed placeholders (`{{seedProductId}}`, `{{seedSoftDeletedProductId}}`, `{{seedInactiveProductId}}`, `{{seedOffSaleProductId}}`) rely on dataset fixtures: one soft-deleted, one inactive and one off-sale product.
- Several probes are meant to be sent in pairs or twice to compare outcomes (with and without the admin token; inactive vs. off-sale; Italian vs. default).
- Only the 422 probe sets `auth`; the others carry no auth field, and the "anonymously" probes depend on that.
