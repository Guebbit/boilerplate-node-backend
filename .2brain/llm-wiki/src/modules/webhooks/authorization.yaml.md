---
source: src/modules/webhooks/authorization.yaml
sha256: 1e87ea9816d1dce30e15d111aca198e6e90dfd60069521afc5e3e8f0e150ffd0
generated_at: 2026-11-08T09:00:06.359538+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/authorization.yaml

## Purpose

Declarative authorization policy for the `webhooks` module. It defines which actions a tenant may perform on `WebhookSubscription` resources and groups those actions into reusable permission sets, so that downstream enforcement (middleware, API gates, etc.) can check access without hard-coding rules.

## Key elements

- **`rules`** — Four action-level rules, all scoped to `tenant` on subject `WebhookSubscription`:
  - `read` — access subscriptions, delivery log, and event catalogue.
  - `create` — add a subscription (mints its first secret).
  - `update` — modify, toggle, rotate/drop secrets, replay a delivery. Deliberately bundled because all these operations share the same blast radius.
  - `delete` — remove a subscription. Kept separate from `update` because the blast radius differs.
- **`sets`** — Two named permission bundles for coarse-grained assignment:
  - **`WebhookDisplay`** — read-only (maps to `read:WebhookSubscription`).
  - **`WebhookManagement`** — write operations (maps to `create`, `update`, and `delete`).

## Relationships

- **`src/modules/webhooks/module.ts`** — The module entry point that registers the `webhooks` module. This YAML file is the policy document it references when the authorization layer resolves `module: webhooks` rules for the `WebhookSubscription` subject.

## Notes

- All rules share `scope: tenant`, meaning a tenant can only act on its own subscriptions; cross-tenant access is not granted here.
- The `update` rule intentionally lumps several distinct operations (toggle, secret rotation, replay) under one key. If you need finer-grained control, you must add new rules rather than splitting `update`.
- `delete` is deliberately **not** included in the same conceptual bucket as `update` (see the inline comment). Treat it as a separate, higher-privilege action when composing permissions.
- The sets use shorthand `action:Subject` notation (e.g. `read:WebhookSubscription`) rather than repeating the full rule object; they resolve against the `rules` block above.
