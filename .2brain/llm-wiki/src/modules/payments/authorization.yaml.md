---
source: src/modules/payments/authorization.yaml
source_sha256: f0b08fec7abc3f37d042240a02a0f60115629aef8263b8bf21939ab9d23f1a75
context_sha256: beadf67f4bb5903f903abfa83e28fdea425d0aa1c7c6a6f80ff9df332901d1f4
generated_at: 2026-11-22T06:40:32.248325+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/authorization.yaml

## Purpose
Declares the authorization rules and permission sets for the `payments` module. Rules define which actions are allowed on which subjects; sets bundle those rules into named, human-meaningful permissions that can be granted to roles.

## Key elements
- **Rules** (all `module: payments`, `scope: tenant`):
  - `read:Payment` — read the caller's own payments. Has `credential: false` and condition `userId: $caller.id`.
  - `display:Payment` — read every payment in the shop (support desk, shop manager).
  - `create:Payment` — record a payment received outside the provider (cash, transfer, by hand). `stepUp: critical`.
  - `create:Refund` — return money to the payer, whole or partial. `stepUp: critical`.
- **Sets** (each wraps exactly one rule):
  - `PaymentOwn` → `read:Payment`
  - `PaymentDisplay` → `display:Payment`
  - `PaymentRecording` → `create:Payment`
  - `PaymentRefunding` → `create:Refund`

## Relationships
- `src/modules/returns/authorization.yaml` has the same file name and the same rules/sets structure, and is a sibling authorization declaration for another module. The file itself doesn't reference it.
- `openapi.yaml` and `asyncapi.webhooks.yaml` are in the same module. This file contains no explicit references to either.

## Notes
- `stepUp: critical` marks the two money-affecting actions (recording a payment, refunding). The comments explain the reasoning: the admin's word is the only proof, and a stolen access token says nothing about how recently its holder entered their password. Refunds are described as irreversible by any later request.
- "Own" access is a condition-based rule (`userId: $caller.id`), whereas `display` is unconditioned shop-wide read access.
- Rule references in sets use the `action:Subject` form.
