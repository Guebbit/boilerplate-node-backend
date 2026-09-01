# src/modules/cart/probes.ts

## Purpose
Provides the cart module's probe collection—concrete API requests that exercise failure paths and boundary conditions the OpenAPI contract cannot express on its own (e.g., "send this body, expect this refusal"). It exists so the runnable-collections runner has cart-specific negative-path scenarios to execute.

## Key elements
- **`probes: Probe[]`** — the sole export. An array of four probe objects:
  - *Empty-cart checkout* (`POST /cart/checkout`): triggers the `checkout_failed` event.
  - *Non-existent product* (`POST /cart` with a null-like `productId`): verifies the 404 guard.
  - *Inactive product via PUT* (`PUT /cart/{{seedInactiveProductId}}`): confirms `cartItemSetById` enforces the catalogue gate.
  - *Zero quantity* (`POST /cart` with `quantity: 0`): proves the schema minimum is enforced rather than silently removing the line.
- All probes use `bearer` auth; two embed `{{seedToken}}` placeholders (`seedInactiveProductId`, `seedProductId`) resolved at emission time.

## Relationships
- **`scripts/contracts/client-collections-bundle.ts`** — Consumes this `probes` array. That file owns the surrounding machinery: the `Probe` semantics, the emission pipeline, and the valid `{{seedToken}}` vocabulary. This file is purely data; the bundle file is the consumer and context-provider.

## Notes
- Probes deliberately target *failure* paths; they are not happy-path examples.
- `{{seedToken}}` values are opaque here—refer to the bundle file for which tokens exist and what they seed.
- The inactive-product probe exists because `PUT /cart/{id}` and `POST /cart` are two separate routes that must each enforce the catalogue check; the probe pins the PUT variant specifically.
