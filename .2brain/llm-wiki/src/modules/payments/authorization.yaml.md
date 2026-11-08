---
source: src/modules/payments/authorization.yaml
sha256: f0b08fec7abc3f37d042240a02a0f60115629aef8263b8bf21939ab9d23f1a75
generated_at: 2026-11-08T07:16:26.033182+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/authorization.yaml

## Purpose

Declares the fine-grained authorization rules and named rule-sets for the payments module. Each rule binds an action (`read`, `display`, `create`) to a subject (`Payment`, `Refund`) at tenant scope, and the `sets` block groups individual rules into reusable permissions that an identity or role can be granted.

## Key elements

- **`rules`** — Four permission entries:
  - `read:Payment` — caller may read only their own payments; enforced by the `conditions: { userId: $caller.id }` filter and `credential: false`.
  - `display:Payment` — broader read across all payments in the tenant (support-desk / shop-manager use case).
  - `create:Payment` — record an out-of-band payment (cash, wire, manual). Marked `stepUp: critical` because the admin's assertion is the sole proof of receipt.
  - `create:Refund` — issue a full or partial refund. Marked `stepUp: critical` because it is the one action whose effect is irreversible.
- **`sets`** — Four named groupings, each wrapping exactly one rule:
  - `PaymentOwn` → `read:Payment`
  - `PaymentDisplay` → `display:Payment`
  - `PaymentRecording` → `create:Payment`
  - `PaymentRefunding` → `create:Refund`

## Relationships

- **`src/modules/payments/module.yaml`** — Parent module manifest. Every rule here carries `module: payments`, tying these permissions into the module's registration; the module file is expected to reference or aggregate this authorization definition.
- **`src/modules/payments/openapi.yaml`** — The OpenAPI spec for the payments endpoints. The rules in this file gate access to those operations (e.g., a `POST /payments` handler checks `create:Payment`; a `GET /payments` handler checks `read:Payment` or `display:Payment`).

## Notes

- `read:Payment` is the only rule with an explicit `conditions` block (row-level filter on `userId`) and the only one with `credential: false`; all others operate on the full tenant dataset.
- The two `critical` step-up rules (`create:Payment`, `create:Refund`) share the same escalation tier even though one is an inbound and one an outbound money movement — the codebase treats both as admin-asserted, non-provider-verified transactions.
- Sets are 1-to-1 with rules here; there is no set that bundles multiple rules. If a role needs both `PaymentRecording` and `PaymentRefunding`, it must be granted both sets individually.
