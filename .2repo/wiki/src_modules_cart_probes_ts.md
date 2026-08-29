# src/modules/cart/probes.ts

## Purpose

Defines API rejection probes for the cart module — requests that prove the API refuses invalid input (empty checkout, dangling product IDs, invisible catalogue items, zero quantities). These exist because an OpenAPI contract declares valid calls and their responses, leaving no place for "this request must fail" cases. The probes are emitted into every generated client collection after the contract-derived requests.

## Key elements

- **`probes: Probe[]`** (exported) — Array of four probe objects. Each carries `name`, `why` (human-readable rationale), `method`, `path`, `auth`, and optionally `body`.
- **`Probe` type** — Imported from `@guebbit/openapi-runnable-collections`; the structural contract for each entry.
- **Seed tokens** (`{{seedProductId}}`, `{{seedInactiveProductId}}`) — Placeholder references to dataset values, substituted at generation time.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Declares the set of valid seed tokens. Probes reference tokens by name; if a probe uses a token not declared there, the generator fails and prints the list of known tokens. The bundle is also where the contract-derived requests are defined, into which these probes are appended.

## Notes

- Seed tokens are **never** hardcoded values. Pasting a literal ID defeats the purpose (the probe would drift from the dataset) and breaks the generator's validation.
- The `why` field is intentional documentation, not a comment — it explains *what invariant* the probe guards, not just what HTTP status to expect.
- The probes assume the seeded non-admin user starts with an empty cart (relevant to the checkout probe's precondition).
- `PUT /cart/{productId}` is called out explicitly because a missing catalogue gate there would be invisible (a line naming an unlisted product renders as nothing rather than an error).
