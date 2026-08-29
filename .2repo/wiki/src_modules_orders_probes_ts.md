# src/modules/orders/probes.ts

## Purpose

Exports a fixed set of **negative probes** (requests the API must *reject*) for the orders module. Because a contract declares valid calls and their expected answers, there is no place in it for "this URL should 403"; this file fills that gap and is appended to every client collection after the contract-derived requests.

## Key elements

- **`probes: Probe[]`** – the sole export. Each entry has a `name`, a `why` explanation, an HTTP `method`/`path` pair, and an `auth` mode. Paths reference dataset values via `{{seedToken}}` placeholders (e.g. `{{seedDeletedOrderId}}`, `{{seedOrderId}}`) rather than literal IDs.
- **Probe 1 – soft-deleted order ownership scoping** – `GET /orders/{{seedDeletedOrderId}}`. Distinguishes ownership-only scoping (would return it) from correct role+ownership scoping (must refuse). The non-admin account owns the one soft-deleted order in the seed data.
- **Probe 2 – cross-tenant read** – `GET /orders/{{seedOrderId}}`. The same URL returns 200 for admin, 403/404 for non-admin; encodes the entire role-scoping contract in one request.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** – declares the set of valid `{{seedToken}}` names. This file's paths must only reference tokens declared there; if a probe invents an unknown token the collection generator fails and prints the list of known ones. The probes are also emitted *after* the contract-derived requests in the final collection.

## Notes

- Tokens are never pasted as literal values. If you add a probe, reference an existing token from the bundle; do not hard-code an ID.
- The `why` strings double as test-case documentation for a human reviewer—they explain *which* account must execute the request and *what* response is correct, not just what the request is.
- Probe 1 has an implicit ordering dependency: the non-admin must already be logged in (see the account probes earlier in the collection). There is no programmatic ordering here; it is a collection-level convention.
