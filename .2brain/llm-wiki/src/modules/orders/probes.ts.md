---
source: src/modules/orders/probes.ts
sha256: 59dd3fd4e87cc1d0b848d24d413ca12539da34ef2e184002e1c169d6220e2b4a
generated_at: 2026-11-08T06:54:20.042090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/probes.ts

## Purpose
Declares a set of **probes** — manual API requests that exercise authorization/scoping rules the OpenAPI contract cannot express on its own. Each probe documents a subtle ownership or role-scoping case in the orders module and tells the test runner how to seed variables before the real collection runs.

## Key elements
- **`probes: Probe[]`** (exported) — the sole export; an array of three probe objects:
  - *Probe 1* (`GET /orders?pageSize=10`) — discovers the minted order IDs for the current demo build. Run first; its response feeds the collection's `orderId` and `deletedOrderId` variables.
  - *Probe 2* (`GET /orders/{{seedDeletedOrderId}}`) — verifies that the non-admin owner of the one soft-deleted order **cannot** retrieve it, while an admin **can**.
  - *Probe 3* (`GET /orders/{{seedOrderId}}`) — verifies cross-tenant read refusal: the non-admin must not see the admin's order; the admin must.
- Each probe carries a `name`, a `why` (human-readable explanation of the scoping rule it guards), `method`, `path`, and `auth` fields per the `Probe` type.

## Relationships
No dependency-graph neighbors are registered. The file is a leaf: it only imports the `Probe` type from `@guebbit/openapi-runnable-collections` and is consumed by the collection-bundling script referenced in its doc comment (`scripts/contracts/client-collections-bundle.ts`).

## Notes
- **Seed tokens** (`{{seedOrderId}}`, `{{seedDeletedOrderId}}`): their valid values and emission logic are defined in `scripts/contracts/client-collections-bundle.ts`, not here.
- **Order of execution matters.** Probe 1 must run before Probes 2–3 so the `orderId` / `deletedOrderId` variables are populated.
- **`npm run demo`** (`GET /__test/scenario`) is the programmatic equivalent of Probe 1; the probe exists so the same discovery step is available inside the Postman/Insomnia collection.
- The `why` strings are intentionally verbose: they encode *expected* auth outcomes (200 vs. 403) that a static contract cannot capture.
