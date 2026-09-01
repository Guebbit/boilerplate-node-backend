# src/modules/products/probes.ts

## Purpose

Holds the products module's ad-hoc probe requests — edge-case scenarios that the OpenAPI contract cannot express on its own (validation failures, `Accept-Language` diffs, optional-filter combinations, and visibility-branch fixtures). It complements the generated collection rather than replacing it.

## Key elements

- **`probes: Probe[]`** (exported const) — Five probe entries, each a `Probe` from `@guebbit/openapi-runnable-collections`:
  - *422 on invalid body* — POST `/products` with empty `title` and negative `price`; verifies the validation envelope and `errors[]` shape.
  - *Italian locale* — GET a product with `Accept-Language: it`; intended to be sent beside the generated request and diffed on `message`.
  - *All optional filters* — GET `/products` with `page`, `pageSize`, `minPrice`, `maxPrice`, `active`; exercises the filter combination most likely to hit a missing index.
  - *Soft-deleted, anonymous* — GET `/products/{{seedSoftDeletedProductId}}`; expects 404 for anonymous, 200 for admin (send twice).
  - *Inactive, anonymous* — GET `/products/{{seedInactiveProductId}}`; contrasts `active: false` with `deletedAt` to observe distinct visibility rules.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Owns the *other half* of the probe story: defines what a probe is for, the emit pipeline that ships these probes, and the registry of valid `{{seedToken}}` values (e.g. `{{seedProductId}}`, `{{seedSoftDeletedProductId}}`, `{{seedInactiveProductId}}`). Probes here reference those tokens but do not define them.

## Notes

- The `{{seed…}}` tokens are **not** defined in this file; resolve them in `client-collections-bundle.ts` before running a probe.
- The Italian-locale probe is deliberately sent *beside* the generated request (not instead of it) so the only diff is the localised `message` field.
- The soft-deleted vs. inactive probes are a pair: they exist to make the two visibility branches observable in one dataset. Run them with and without the admin token and compare.
- `Accept-Language` is never declared per-operation in the contract (it is a global interceptor concern), so no code generator will emit it — that is exactly why this probe lives here.
