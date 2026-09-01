# src/modules/wishlist/probes.ts

## Purpose

Exports the wishlist module's list of contract-uncoverable edge-case requests (probes). These are requests whose failure modes a standard OpenAPI contract cannot express—stale references, malformed ids, or actions on rows the caller does not hold—each with a human-readable `why` explaining the exact gap in the contract.

## Key elements

- **`probes: Probe[]`** (exported const) — The full probe collection for the wishlist. Four entries:
  - *POST /wishlist* with `{{seedInactiveProductId}}` — saves a hidden product; exercises the 404 visibility gate on write.
  - *POST /wishlist/{{seedSoftDeletedProductId}}/move-to-cart* — moves a product the caller never saved; exercises the 404 on the "exit" path.
  - *DELETE /wishlist/000000000000000000000000* — unsaves a valid-but-absent ObjectId; distinct code path from the move (repository filter vs. list read).
  - *DELETE /wishlist/not-an-object-id* — malformed id; expects 422, not 404, because the Mongo-shape check lives in the controller, not the contract.

- **`Probe`** (type import from `@guebbit/openapi-runnable-collections`) — The shape each entry conforms to (`name`, `why`, `method`, `path`, `auth`, optional `body`).

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — The module doc explicitly delegates to this file the definition of what a probe is for, where probe arrays are emitted into the runnable bundle, and which `{{seedToken}}` values are available. This file only *consumes* that infrastructure by supplying the wishlist-specific array.

## Notes

- `{{seedToken}}` placeholders in `path` and `body` are resolved by the bundle emitter (in the contracts script), not by this file. The tokens used here (`seedInactiveProductId`, `seedSoftDeletedProductId`) must already be registered there.
- The zero-ObjectId probe uses a literal 24-char string rather than a seed token; this is intentional—it needs a well-formed but guaranteed-absent id.
- The `why` strings are the source of truth for *why* a probe exists; they are expected to be rendered into the runnable collection output, not just developer documentation.
- Auth is always `bearer` across all probes; there are no anonymous variants here.
