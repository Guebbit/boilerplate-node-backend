---
source: scenarios/config.ts
sha256: 94d9c8d04ca8520cc7070746d710487aeed5322262d7df6f3cf30dc294f7510a
generated_at: 2026-10-14T06:56:16.619341+00:00
model: ollama:qwen3.8:27b
---

# scenarios/config.ts

## Purpose

Declares the seeder and demo webhook sink as config slices (via the shared `defineConfig` layer) so that the `NODE_SEED_*_PASSWORD` variables and `NODE_WEBHOOK_DEMO_SINK_URL` appear in the same variable inventory as app-level config. It is **not** part of the app's boot gate — the seeder is a script, not the application — but it is read through the same infrastructure so documentation and "blank means unset" semantics stay uniform.

## Key elements

- **`seedPassword(account, fallback)`** — internal helper returning a `text({ default, sensitive: true })` field. The fallback is a real demo password (committed), not a placeholder.
- **`seedPasswordsConfig`** (`name: 'scenario-seeds'`) — the 13 `NODE_SEED_*_PASSWORD` fields covering every named persona (admin, user, editor, moderator, unverified, two-factor, pending-email, banned, second-shopper, manager, warehouse, support, operator).
- **`demoSinkConfig`** (`name: 'scenario-webhook-sink'`) — a single `NODE_WEBHOOK_DEMO_SINK_URL` field (no default). Read by the seeder (to point the subscription it writes at the sink) and by the dev preload (to exempt the sink's loopback/compose origin from the SSRF check). Never touched by production code.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the factory used to build both exported config slices.
- **`src/infrastructure/config/fields.ts`** — provides the `text` field builder used by `seedPassword` and `demoSinkConfig`.
- **`scenarios/accounts.ts`** — the seeder that consumes `seedPasswordsConfig` to create/update the named accounts; each `NODE_SEED_*_PASSWORD` entry maps to one of those accounts.
- **`scenarios/webhooks.ts`** — the seeder that consumes `demoSinkConfig` to set the demo subscription's callback URL to the sink address.

## Notes

- Fallback passwords are **real, committed** values, not placeholders. Safety comes from `scenario:apply` refusing to run outside `development`/`test`, not from secret obfuscation. The repo intentionally commits `.env` in the clear.
- A blank (empty-string) value for any of these fields means "unset," matching the convention used everywhere else in the config layer.
- This file is deliberately excluded from the app's boot gate; including it there would be misleading since production has none of these variables.
