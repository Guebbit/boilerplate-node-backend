# src/modules/products/probes.ts

## Purpose

Holds the product-module probe requests that an OpenAPI contract cannot express—negative validation checks, cross-cutting headers, optional-only query params, and dataset-specific state fixtures. These probes are appended to generated client collections after the contract-derived requests so the API's *rejection* and *edge-state* behavior is exercised alongside the happy path.

## Key elements

- **`probes: Probe[]`** (exported, typed from `@guebbit/openapi-runnable-collections`) — the sole export; an array of five probe objects, each with `name`, `why`, `method`, `path`, and optional `auth`, `body`, or `headers`.
  - *422 on schema violation* — `POST /products` with empty title + negative price; asserts the validation envelope.
  - *Italian `Accept-Language`* — `GET /products/{{seedProductId}}`; verifies locale-aware messages without a per-operation contract declaration.
  - *All optional filters at once* — `GET /products` with paging, price bounds, and active flag; exercises the filter combination most likely to expose a bad index.
  - *Soft-deleted product, anonymous* — `GET /products/{{seedSoftDeletedProductId}}`; expects 404 for anonymous, record for admin (send twice).
  - *Inactive product, anonymous* — `GET /products/{{seedInactiveProductId}}`; distinguishes `active: false` from `deletedAt` set.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — The bundle generator imports this module's `probes` and emits them into every client collection *after* the contract-derived requests. Seed tokens (`{{seedProductId}}`, `{{seedSoftDeletedProductId}}`, `{{seedInactiveProductId}}`) are declared in that file; a probe referencing an unknown token causes the generator to fail with a list of valid tokens.

## Notes

- **Never paste literal IDs into `path`.** Use `{{seedToken}}` placeholders. The token vocabulary is closed and enforced at generation time—typos are caught, not silently resolved.
- The `why` field is the human (and AI) rationale for each probe; it doubles as test documentation and should be kept current if the probe's intent changes.
- Probes are additive to the contract: they do not alter the OpenAPI spec and are not visible to consumers of the spec itself.
- The soft-deleted vs. inactive pair is intentional: they are *different* visibility states, and the probes exist so the distinction is observable rather than assumed.
