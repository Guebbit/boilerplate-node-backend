# src/modules/orders/probes.ts

## Purpose

Defines a small set of authorization-scoping probes for the orders module — requests whose correct behavior (allow vs. refuse) depends on the caller's role and the order's deletion state, details the OpenAPI contract alone cannot express. The probes are consumed by the runnable-collections tooling to augment generated client collections.

## Key elements

- **`probes: Probe[]`** — the sole export. An array of two `Probe` objects (type from `@guebbit/openapi-runnable-collections`):
  - *Soft-deleted order, owner*: `GET /orders/{{seedDeletedOrderId}}`. Verifies that ownership-only scoping is insufficient; the non-admin owner must be refused while an admin succeeds.
  - *Cross-tenant order*: `GET /orders/{{seedOrderId}}`. The same URL must refuse a non-admin and allow the seeded admin, demonstrating role-based scoping in a single endpoint.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — The module doc comment points to this file as the canonical reference for: the definition and purpose of a probe, the emission location for these probes, and the valid `{{seedToken}}` values (e.g. `{{seedDeletedOrderId}}`, `{{seedOrderId}}`) that a probe path may use. This file is the producer; that file is the consumer/spec.

## Notes

- The `why` strings are instructions for the *human* running the collection (e.g. "log in as the non-admin first"). They encode expected outcomes, not assertions — the tooling does not parse them.
- Both probes use `auth: 'bearer'`; the differentiation between admin and non-admin is driven entirely by which token the collection holds at runtime, not by the probe definition itself.
