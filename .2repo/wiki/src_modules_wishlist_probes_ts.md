# src/modules/wishlist/probes.ts

## Purpose

Exports a set of API rejection probes for the wishlist module. Because a contract can only declare valid calls and their declared answers, these probes cover the cases where the API must *reject* a request (404, 422) and have no natural home in the contract-derived collection. They are emitted into every client collection after the contract-derived requests.

## Key elements

- **`probes: Probe[]`** — exported array (typed from `@guebbit/openapi-runnable-collections`) of four probe definitions:
  - *Save a hidden/inactive product* (`POST /wishlist`) — exercises the visibility gate on write; expects 404.
  - *Move an unsaved product to cart* (`POST /wishlist/{id}/move-to-cart`) — exercises the "not-in-list" branch of the move path; expects 404.
  - *Delete an unsaved product* (`DELETE /wishlist/{id}`) — same contract as above but a different code path (repository filter vs. list read); expects 404.
  - *Malformed ObjectId* (`DELETE /wishlist/not-an-object-id`) — exercises the controller-level Mongo-shaped validation; expects 422, distinct from 404.

Each probe carries `name`, `why` (human rationale), `method`, `path`, `auth`, and optional `body`.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Declares the seed tokens referenced in probe paths and bodies (e.g. `{{seedInactiveProductId}}`, `{{seedSoftDeletedProductId}}`). The probe file is injected into the client collections produced by that bundle, *after* the contract-derived requests.

## Notes

- Seed tokens are **never** written as literal values in this file. They are `{{…}}` placeholders resolved at generation time against the dataset.
- Inventing a token that is not declared in the bundle causes the generator to fail and print the list of known tokens.
- The 422 probe uses a hardcoded string (`not-an-object-id`), not a seed token, because it tests *shape* validation, not a record's existence.
- The `why` fields are intentional documentation: they explain *why* the probe exists and why the contract cannot express the scenario. Keep them when adding probes.
