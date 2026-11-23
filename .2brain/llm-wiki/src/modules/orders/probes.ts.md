---
source: src/modules/orders/probes.ts
source_sha256: aa3ced0fc8477959f0ef6db3edf4ea6715fb12f19aeab065aa6a038f8818456b
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T06:17:11.040768+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/probes.ts

## Purpose
Defines hand-written "probe" requests for the orders module: cases the OpenAPI contract cannot express on its own, mainly role- and ownership-based scoping of orders. The probes are meant to be emitted into a generated runnable collection. The module's doc comment points to `scripts/contracts/client-collections-bundle.ts` for what a probe is, where probes are emitted, and which `{{seedToken}}` values they may use.

## Key elements
- `probes: Probe[]` is the only export. The `Probe` type comes from `@guebbit/openapi-runnable-collections`. Each entry has `name`, `why` (a prose explanation), `method`, `path` and `auth`. All three use `GET` with `auth: 'bearer'`.
  - **"the ids for every request below"** sends `GET /orders?pageSize=10`. Order ids are minted when the demo shop is built, so they change between builds. The probe is sent first to discover ids. The user then sets the collection's `orderId` variable to any returned id, and `deletedOrderId` to the id the non-admin account owns.
  - **"the owner asking for their own soft-deleted order"** sends `GET /orders/{{seedDeletedOrderId}}`. The dataset puts its one soft-deleted order on the non-admin user. Ownership-only scoping would allow the read, and correct scoping must refuse it. An admin token on the same URL must succeed.
  - **"another user's order"** sends `GET /orders/{{seedOrderId}}`, which is the seeded admin's order. As the non-admin it is a cross-tenant read that must be refused. As the admin it is legitimate.

## Relationships
No graph neighbors are listed, so there are no tracked file dependencies. The only import is the `Probe` type from the `@guebbit/openapi-runnable-collections` package. The `why` text mentions `npm run demo` and its `GET /__test/scenario` endpoint, which answers the same id question by name. It also refers to "the account probes" that handle logging in as the non-admin.

## Notes
- The probes are order-dependent in practice. Log in as the right account (non-admin or admin) before sending, because the expected result depends on the token held.
- `{{seedDeletedOrderId}}` and `{{seedOrderId}}` are seed-token placeholders. The first probe uses the collection variables `orderId` and `deletedOrderId` instead, which are set by hand.
