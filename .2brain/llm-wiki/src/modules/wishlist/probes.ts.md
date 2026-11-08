---
source: src/modules/wishlist/probes.ts
sha256: ca58feabbb83cdb19c01f45a0b1e5c3a8357174b480c9115ffe2777f97d7d4b4
generated_at: 2026-11-08T09:13:36.883531+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/probes.ts

## Purpose

Defines the wishlist module's probe collection: a fixed set of HTTP requests that exercise edge cases the OpenAPI contract cannot express (malformed ids, stale references, missing rows). These probes are consumed by the client-collections bundling pipeline to generate runnable test collections alongside the contract-derived ones.

## Key elements

- **`probes: Probe[]`** (exported) — the sole export. A four-entry array of `Probe` objects (type imported from `@guebbit/openapi-runnable-collections`):
  - *Save a hidden product* — `POST /wishlist/items` with a `{{seedInactiveProductId}}` body; expects a 404 because the product is scoped out.
  - *Move a never-saved product* — `POST /wishlist/items/{{seedSoftDeletedProductId}}/move-to-cart`; expects 404 on a row the caller does not hold.
  - *Unsave a never-saved product* — `DELETE /wishlist/items/000000000000000000000000`; expects 404 via the repository-filter path (distinct code path from the move endpoint).
  - *Malformed ObjectId* — `DELETE /wishlist/items/not-an-object-id`; expects 404 because the controller cannot construct a valid `Id` from the string.

## Relationships

No dependency-graph neighbors are recorded. The module header notes that `scripts/contracts/client-collections-bundle.ts` owns the surrounding semantics (what a probe is for, emission location, valid `{{seedToken}}` vocabulary), but that file is not listed as a graph neighbor here.

## Notes

- The `why` strings are prose, not comments — they become part of the generated collection's metadata for human readers.
- Probe bodies/paths use `{{seedToken}}` placeholders resolved at bundle time, not at runtime.
- The "malformed ObjectId" probe uses the literal string `not-an-object-id`; the contract types `Id` as a plain `string`, so the Mongo-shape check is enforced in the controller, not in schema validation.
- The move-to-cart and delete probes hit different code paths despite producing the same 404 status; the file explicitly calls this out to justify keeping them as separate probes.
