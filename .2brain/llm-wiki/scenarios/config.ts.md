---
source: scenarios/config.ts
sha256: 0648431a997ffb07de1056f9768236d443f880b4dc57c9a38a585a16f8479f58
generated_at: 2026-11-08T02:28:20.168699+00:00
model: ollama:qwen3.8:27b
---

# scenarios/config.ts

## Purpose

Defines two configuration slices consumed exclusively by the demo seeder and dev preload: the `NODE_SEED_*` credential variables (13 persona passwords + one shared TOTP secret) and the demo webhook-sink URL. Each variable has a committed, public fallback so the seeder works out-of-the-box in development; production never reads these slices.

## Key elements

- **`seedPassword(fallback: string)`** — Internal helper. Wraps `text({ default: fallback, sensitive: true })` so every seed field gets a committed value and is marked sensitive for logging/masking.
- **`seedPasswordsConfig`** — A `defineConfig` named `scenario-seeds`. Declares 14 `text` fields (`NODE_SEED_*_PASSWORD` for each persona, plus `NODE_SEED_STAFF_TOTP_SECRET`). Fallbacks are pulled from `personas.accounts.*.defaultPassword` and `personas.staffTotpSecret`.
- **`seedPasswords(): Record<PersonaName, string>`** — Resolves the config and returns a flat map of persona name → password string. Spelled out field-by-field (not generated) so the env-var names remain the stable, documented contract.
- **`demoSinkConfig`** — A `defineConfig` named `scenario-webhook-sink`. Declares a single `text` field, `NODE_WEBHOOK_DEMO_SINK_URL`, with **no** default (blank means unset). Read by the seeder (to write the subscription URL) and by the dev preload (to exempt the loopback/compose origin from the SSRF check).

## Relationships

- **`src/infrastructure/config/define.ts`** — Imports `defineConfig`; the two config slices are built through it.
- **`src/infrastructure/config/fields.ts`** — Imports the `text` field type used for every entry in both slices.
- **`scenarios/personas-schema.ts`** — Imports the `personas` data (to source default passwords and the staff TOTP secret) and the `PersonaName` type (used as the key type of `seedPasswords`'s return value).

## Notes

- Fallbacks are **intentionally public**. The safety boundary is that `scenario:apply` refuses to run outside development/test, not that the values are secret.
- `NODE_SEED_STAFF_TOTP_SECRET` is a shared authenticator secret, not a per-account password, but it reuses the `seedPassword` helper for consistency.
- `demoSinkConfig`'s field has no default, unlike every `seedPassword` field — a blank value means "unset" here, consistent with the rest of the config layer.
- This module is **not** part of the application boot gate; it is read only by the seeder script and the dev preload.
