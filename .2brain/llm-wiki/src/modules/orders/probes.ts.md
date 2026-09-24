---
source: src/modules/orders/probes.ts
sha256: 59dd3fd4e87cc1d0b848d24d413ca12539da34ef2e184002e1c169d6220e2b4a
generated_at: 2026-09-23T19:04:54.609367+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/probes.ts

## Purpose

Defines the orders module's "probe" requests—HTTP calls that validate scoping behaviors the OpenAPI contract cannot express on its own. The probes are consumed by the client-collections bundle to generate runnable Postman/Insomnia-style requests that exercise role-based and ownership scoping in the orders API.

## Key elements

- **`probes`** (`Probe[]`) — The sole export. An ordered array of three probe objects:
    - **Probe 1** (`GET /orders?pageSize=10`) — Discovers live order IDs; the caller must send this first and feed the returned IDs into the collection's `orderId` / `deletedOrderId` variables.
    - **Probe 2** (`GET /orders/{{seedDeletedOrderId}}`) — Verifies that a soft-deleted order is invisible to its non-admin owner but visible to an admin (ownership-only vs. correct scoping).
    - **Probe 3** (`GET /orders/{{seedOrderId}}`) — Exercises cross-tenant read refusal (non-admin) vs. legitimate admin read on the same URL.
- **`Probe`** (type) — Imported from `@guebbit/openapi-runnable-collections`; each probe has `name`, `why`, `method`, `path`, and `auth` fields.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — The file that consumes this export. Per the module doc comment, that script defines what a probe is for, _emits_ these probes into the generated collection, and resolves the `{{seedOrderId}}` / `{{seedDeletedOrderId}}` seed tokens used in probe paths.

## Notes

- Probe **order matters**: probe 1 must precede the other two because it populates the collection variables (`orderId`, `deletedOrderId`) that the remaining probes depend on at runtime.
- The `{{seedOrderId}}` and `{{seedDeletedOrderId}}` tokens are resolved by the bundle script, not by this file; this file only references them as template placeholders.
- The `why` strings embed references to `npm run demo` and the `GET /__test/scenario` endpoint as an alternative way to obtain the same ID-discovery answer—those are external to this module.
