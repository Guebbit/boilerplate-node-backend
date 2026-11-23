---
source: src/modules/cart/probes.ts
source_sha256: cd70fec93809790c0a9c3a21c3c77bc29397ddba5e1a74b7b09693f11d6d7df6
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T04:34:23.289596+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/probes.ts

## Purpose
Defines the cart module's "probes": requests that the API contract (OpenAPI) cannot describe on its own, such as ones that trigger specific failure paths. They are exported as a collection of `Probe` objects from `@guebbit/openapi-runnable-collections`. The module header says the wider definition of a probe, where probes are emitted, and which `{{seedToken}}` values they may use are documented elsewhere (in `scripts/contracts/client-collections-bundle.ts`).

## Key elements
- `probes: Probe[]` is the only export. It holds four probes. Each has a `name`, a `why` (the reason the probe exists), a `method`, a `path` and `auth: 'bearer'`. Some also have a `body`.
  - **Checkout with an empty cart:** `POST /cart/checkout`. The cart must be cleared first. The API refuses and emits `checkout_failed`, which the frontend cart store also reports. The seeded non-admin user starts with an empty cart so this state is reachable.
  - **Add a product that does not exist:** `POST /cart/items` with a well-formed body (`productId` `000000000000000000000000`, `quantity` 1). It checks that the service does not store a dangling reference. The contract can describe the 404 but not a request that earns one.
  - **Set a quantity on a product the storefront will not show:** `PATCH /cart/items/{{seedInactiveProductId}}` with `quantity: 1`. It checks that the PATCH route inherits the catalogue-gate refusal from the service shared with `POST /cart/items`. The `why` text says it answers 404 either way, because the cart holds no such line.
  - **A quantity the schema forbids:** `POST /cart/items` with `productId: '{{seedProductId}}'` and `quantity: 0`. The contract requires a quantity of at least one, and removing a line has its own endpoint, so zero is a validation failure.

## Relationships
None. The file has no graph neighbors; its only import is the `Probe` type from the external package `@guebbit/openapi-runnable-collections`.

## Notes
- Seed placeholders are `{{seedProductId}}` and `{{seedInactiveProductId}}`. Their valid values are defined outside this file.
- The path parameter in the PATCH probe is a seed token, not an OpenAPI-style `{productId}`.
- The empty-cart checkout probe depends on state: the cart must be cleared before it is sent.
