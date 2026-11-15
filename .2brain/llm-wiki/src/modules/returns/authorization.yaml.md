---
source: src/modules/returns/authorization.yaml
sha256: 76524d4a95d58d00f8c4d9704cdec9f2ddb61126f056c63e5557046cb71a55eb
generated_at: 2026-11-14T21:32:18.976360+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/authorization.yaml

## Purpose

Declarative authorization policy for the **returns** module. It defines which actions (read, update, receive) may be performed on the `Return` subject, at `tenant` scope, and groups them into reusable permission sets that roles or scopes can be assigned.

## Key elements

- **`rules`** — Three actions on `Return`, all `module: returns`, `scope: tenant`:
  - `read` — view every return in the shop (the staff queue).
  - `update` — approve, decline, cancel, open a return, or record a withdrawal.
  - `receive` — record that goods arrived (restocks units, triggers refund) or record the buyer's proof of sending. Carries `stepUp: critical` because it disburses money, placing it at the same trust tier as `create:Refund`.
- **`sets`** — Three named permission sets:
  - `ReturnDisplay` → `read:Return`
  - `ReturnManagement` → `update:Return`
  - `ReturnReceiving` → `receive:Return`

## Relationships

- **`src/modules/returns/module.ts`** — This file's `module: returns` field is the join key that the module runtime uses to look up the rules and sets defined here.
- **`src/modules/returns/openapi.yaml`** — The OpenAPI spec declares the HTTP surface for the module; the rules in this file are the authorization gate evaluated against those operations.

## Notes

- **No own-rows rule.** A return is keyed by `orderId`, never `userId`, so "own" is inherited from order ownership. Erasing a customer account does not orphan the record to any personal identity — only the `tenant` scope applies.
- **`receive` is deliberately narrower than `update`.** The warehouse role records physical arrival without gaining the authority to decide whether the return was owed (mirrors the `start:Shipment` vs. `update:Order` split).
- **`stepUp: critical` on `receive`** means a fresh step-up (e.g. re-entering the password) is required even if the caller holds a valid access token; the file's rationale is that a stolen token reveals nothing about how recently the holder authenticated.
