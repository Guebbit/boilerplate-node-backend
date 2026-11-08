---
source: src/modules/orders/authorization.yaml
sha256: 913e785edd639ef3eb86340f8636688bb12edfcc02d99f0a8bed3391a7a6de00
generated_at: 2026-11-08T06:45:21.204547+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/authorization.yaml

## Purpose

Declarative authorization policy for the orders module. It defines the seven permitted actions on the `Order` entity (read, display, create, update, delete, override, export), any conditions or step-up requirements attached to each, and groups them into named rule sets that roles can reference when granting access.

## Key elements

- **`rules`** — Seven action definitions, each specifying `action`, `subject: Order`, `scope: tenant`, and optional `conditions` / `stepUp`:
  - `read` — caller's own orders only; gated by `userId: $caller.id` and `deletedAt: null`; `credential: false`.
  - `display` — every order in the shop (support desk, warehouse staff).
  - `create` — raise an order on someone else's behalf (explicitly *not* checkout).
  - `update` — advance an order along its status path.
  - `delete` — remove an order.
  - `override` — bypass the lifecycle gate to force a delivery move or correct a status by hand; `stepUp: critical`.
  - `export` — take all orders out as CSV (including customer emails); `stepUp: sensitive`.
- **`sets`** — Seven named groups (`OrderOwn`, `OrderDisplay`, `OrderCreation`, `OrderEditing`, `OrderRemoval`, `OrderOverride`, `OrderExport`), each wrapping exactly one rule. Serves as the unit of assignment for roles.

## Relationships

- **`src/modules/orders/openapi.yaml`** — The OpenAPI spec defines the HTTP endpoints (read, create, update, delete, export orders). This file is the authorization layer that determines *who* may call each endpoint and under what conditions/step-up.
- **`src/modules/delivery/module.yaml`** — The `override` rule explicitly exists to "force a delivery move," and `update` drives the status path that delivery consumes. Authorization for delivery-side actions on an order is mediated through these two rules.

## Notes

- `read` is the only rule carrying row-level `conditions`; all other rules are module-wide within the tenant scope.
- `display` ≠ `read`: `read` is scoped to the caller's own orders; `display` grants visibility across the whole shop. They are separate actions and separate sets.
- `override` and `export` carry `stepUp`, meaning the caller must re-authenticate at a higher assurance level before the action is permitted. The `export` step-up cannot be satisfied by an API key (requires a human).
- The `credential: false` on `read` is explicit: bearer-credential checks are not applied to this particular rule.
- `create` is deliberately *not* the checkout path; it is for acting on another party's behalf.
