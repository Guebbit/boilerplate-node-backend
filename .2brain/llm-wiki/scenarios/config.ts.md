---
source: scenarios/config.ts
sha256: 0648431a997ffb07de1056f9768236d443f880b4dc57c9a38a585a16f8479f58
generated_at: 2026-10-29T01:21:53.705769+00:00
model: ollama:qwen3.8:27b
---

# scenarios/config.ts

## Purpose

Defines the seeder and demo webhook sink's environment variables as config slices. It wraps the 13 `NODE_SEED_*` password/secret variables and the `NODE_WEBHOOK_DEMO_SINK_URL` with committed, public fallbacks so that a blank value consistently means "unset." It reads through the same infrastructure config layer as the app but is **not** part of the app's boot gate—the seeder is a script, and production has none of these variables.

## Key elements

- **`seedPassword(fallback)`** — Private helper. Returns a `text` field marked `sensitive: true` with a committed demo default. The fallback is a real value (not a placeholder) on purpose; safety is enforced by `scenario:apply` refusing to run outside development/test.
- **`seedPasswordsConfig`** — `defineConfig` slice named `scenario-seeds`. Declares 14 fields: one per persona's `NODE_SEED_*_PASSWORD` plus the shared `NODE_SEED_STAFF_TOTP_SECRET`. Defaults come from `personas.accounts.*.defaultPassword` and `personas.staffTotpSecret`.
- **`seedPasswords()`** — Resolves `seedPasswordsConfig()` and returns a `Record<PersonaName, string>` mapping each of the 13 persona names to its password. Spelled out explicitly (not computed) because the `NODE_SEED_*` variable names are the stable, documented contract.
- **`demoSinkConfig`** — `defineConfig` slice named `scenario-webhook-sink`. Declares a single `text` field for `NODE_WEBHOOK_DEMO_SINK_URL` (the loopback/compose address where the demo webhook sink listens).

## Relationships

- **`scenarios/personas-schema.ts`** — Imports `personas` (for the committed default passwords and the shared TOTP secret) and the `PersonaName` type (to type `seedPasswords()`'s return).
- **`src/infrastructure/config/define.ts`** — Imports `defineConfig` to build both config slices.
- **`src/infrastructure/config/fields.ts`** — Imports the `text` field type used for every field in both slices.
- **`scenarios/webhooks.ts`** (downstream) — The sink URL defined here is the address the seeder writes into webhook subscriptions; `webhooks.ts` is the domain module that consumes that address.

## Notes

- Fallback passwords are **intentionally committed and public**. The only guard preventing them from reaching a production database is the `scenario:apply` command's environment check (development/test only).
- `seedPasswords()` does not include the TOTP secret—that is accessed directly via `seedPasswordsConfig().NODE_SEED_STAFF_TOTP_SECRET` when needed (e.g., provisioning authenticator codes).
- The file is a script-side config; it will never be imported by production app modules. Treat a missing/blank value as "use the committed default," consistent with the rest of the config layer.
