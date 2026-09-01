# src/modules/account/probes.ts

## Purpose

Defines the four HTTP probe requests for the account module that the OpenAPI contract cannot itself express (error-triggering calls, multi-state scenarios). These probes are emitted alongside the contract-generated collection to verify behaviors that have no single-operation representation in the spec.

## Key elements

- **`probes: Probe[]`** — The sole export. An array of four `Probe` objects (type from `@guebbit/openapi-runnable-collections`), each describing a method, path, body/headers, a `name`, and a `why` explanation:
  - *Probe: log in as the non-admin* — `POST /account/login` with seeded non-admin credentials to exercise role-scoped 403s.
  - *Probe: 401 with a bogus token* — `GET /account` with a garbage Bearer token to confirm the real 401 error envelope.
  - *Probe: 409 on a signup that already exists* — `POST /account/signup` re-registering the seeded admin's email.
  - *Probe: rate limit (send repeatedly)* — `POST /account/login` with a deliberately wrong password, intended to be burst-sent until the middleware returns 429.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — The owning bundle that imports this module. The bundle defines what a probe is for, where probes are emitted into the generated collection, and which `{{seedToken}}` values a probe may reference. This file supplies only the probe definitions; the bundle handles integration and token resolution.

## Notes

- Template variables in request bodies (`{{seedUserEmail}}`, `{{seedAdminEmail}}`, etc.) are resolved by the bundle at generation time — they are not real values.
- The "rate limit" probe is designed to be sent in a burst; a single invocation will not trigger the 429.
- Probes intentionally target error/edge-case statuses (401, 403, 409, 429) that the contract *declares* in its response schemas but cannot *produce* as a happy-path request.
