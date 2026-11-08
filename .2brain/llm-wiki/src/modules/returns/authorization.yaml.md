---
source: src/modules/returns/authorization.yaml
sha256: fe9448fa5298336c77f84f27380ed6ba2a53906978203d4c23cf79b5519437a9
generated_at: 2026-11-08T07:55:32.622307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/authorization.yaml

## Purpose

Declares the authorization rules and permission sets that govern access to the `Return` resource in the returns module. It encodes three tenant-scope permissions (read, update, receive) and bundles them into named sets that other parts of the system can grant or require.

## Key elements

- **`rules`** — Three rules on the `Return` subject, all at `tenant` scope:
  - `read:Return` — view any return in the shop (queue view for staff).
  - `update:Return` — approve, decline, cancel, or open a return / record a withdrawal.
  - `receive:Return` — record that goods arrived; triggers restock and refund. Carries `stepUp: critical` because it effects payment.
- **`sets`** — Three named permission sets, each wrapping exactly one rule:
  - `ReturnDisplay` → `read:Return`
  - `ReturnManagement` → `update:Return`
  - `ReturnReceiving` → `receive:Return`

## Relationships

- **`src/modules/returns/module.ts`** — The module entry point that registers the `Return` subject and imports this file's rules/sets into the runtime authorization registry.
- **`src/modules/returns/openapi.yaml`** — Defines the `Return` resource schema (including the `orderId` key) that these rules protect; the rules reference the subject name defined there.

## Notes

- There is **no own-rows rule** for `Return`. A return is keyed by `orderId`, never by `userId`, so "own" is determined by order ownership. Erasing a customer account orphans the return record with no personal link.
- `receive` is intentionally narrower than `update` (analogous to `start:Shipment` vs `update:Order`): the warehouse can confirm arrival without being granted approval/decline authority.
- `stepUp: critical` on `receive` mirrors the tier on `create:Refund` — the justification is that a stolen token proves nothing about recent password entry, and the action moves money.
- Sets are 1-to-1 with rules here; do not assume a set aggregates multiple rules in this module.
