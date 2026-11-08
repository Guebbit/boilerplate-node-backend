---
source: src/modules/delivery/authorization.yaml
sha256: e4cdc50cb7e3db6dee38129aa7015cde3de44e94bddd054a9c31db330e7d59af
generated_at: 2026-11-08T05:25:59.816422+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/authorization.yaml

## Purpose

Declares the authorization rules and role sets for the delivery module. It defines which actions a tenant-scoped principal may perform against `Shipment` (update and start) and groups them into named sets that other modules or identity providers reference when granting permissions.

## Key elements

- **`rules.update:Shipment`** — Tenant-scoped permission covering the full operational lifecycle of a shipment: cutting from a fulfillment order, recording arrival, correcting tracking codes, reporting loss/damage, and holding or releasing a fulfillment order.
- **`rules.start:Shipment`** — Tenant-scoped permission to begin fulfilling a paid order (the `paid → processing` transition). Intentionally separate from a broader `update:Order` rule so the warehouse can start work without owning the order record.
- **`sets.DeliveryManagement`** — Groups `update:Shipment` under a single grantable set.
- **`sets.DeliveryStart`** — Groups `start:Shipment` under a single grantable set.

## Relationships

- **`src/modules/delivery/module.ts`** — Consumes this file at module initialization to register the delivery module's authorization rules with the platform's authorization engine.
- **`src/modules/delivery/openapi.yaml`** — The OpenAPI spec defines the HTTP endpoints (e.g., `POST /orders/{id}/process`) whose access is governed by the rules declared here.
- **`src/modules/example/authorization.yaml`** — Serves as the reference template; this file mirrors its top-level `rules` / `sets` structure and field vocabulary.

## Notes

- The `start:Shipment` rule is deliberately **narrower** than `update:Order`. The `paid → processing` state transition is `system`-only in `orders/domain/lifecycle.ts`; this rule exists solely to gate `POST /orders/{id}/process`, which internally calls `markProcessing` in `orders/services/status.ts`. Do not collapse it into a generic order-update permission.
- Rule identifiers follow the `action:Subject` convention (e.g., `update:Shipment`, `start:Shipment`) and are referenced by name inside `sets[].rules`.
- All rules in this file carry `scope: tenant`, meaning they apply at the multi-tenant boundary rather than per-organization or per-user.
