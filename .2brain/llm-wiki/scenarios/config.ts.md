---
source: scenarios/config.ts
generated_at: 2026-11-22T01:42:19.648246+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/config.ts

## Purpose

Defines the seeder's and the demo's own environment variables as config slices. These are the `NODE_SEED_*` account passwords and TOTP secret, each with a committed, public fallback, plus the demo webhook sink's URL. They are read through the shared config layer, so a blank value counts as unset. They are not part of the app's boot gate, because the seeder is a script and production has none of these variables.

## Key elements

- `seedPassword(fallback)` (private): builds a `text({ default: fallback, sensitive: true })` field.
- `seedPasswordsConfig`: a `defineConfig` slice named `scenario-seeds`. It has 14 fields:
  - 13 `NODE_SEED_<ACCOUNT>_PASSWORD` variables, one per persona: admin, user, editor, moderator, unverified, two-factor, pending-email, banned, second-shopper, manager, warehouse, support and operator.
  - `NODE_SEED_STAFF_TOTP_SECRET`, the one authenticator secret shared by every armed account.
  - Each default comes from `personas.accounts.<name>.defaultPassword`, or from `personas.staffTotpSecret` for the TOTP secret.
- `seedPasswords()`: resolves `seedPasswordsConfig()` and returns a `Record<PersonaName, string>` keyed by persona name. Each value is the env override, or the committed default if none is set. It maps the 13 passwords only and does not include the TOTP secret.
- `demoSinkConfig`: a `defineConfig` slice named `scenario-webhook-sink` with a single field, `NODE_WEBHOOK_DEMO_SINK_URL: text()`. It has no default declared here.

## Relationships

- `scenarios/personas-schema.ts`: supplies `personas` (the account defaults and `staffTotpSecret`) and the `PersonaName` type. The in-file comments say the committed passwords come from `shared/scenarios/personas.yaml`.
- `src/infrastructure/config/define.ts`: provides `defineConfig`, which builds both slices.
- `src/infrastructure/config/fields.ts`: provides the `text` field helper.
- `scenarios/accounts.ts` and `scenarios/webhooks.ts`: they are graph neighbors, but this file does not import them. The comments say the seeder reads the sink URL when it writes the webhook subscription. Their direct use of these exports is not visible in this file.

## Notes

- The password fallbacks are real, public demo values rather than placeholders. The comments say `scenario:apply` refuses to run outside development or test, and that this is what keeps them away from any database other than a developer's or CI's.
- The fields are marked `sensitive: true` even though their defaults are committed.
- The password keys in `seedPasswords()` are written out by hand because the variable names are the stable, documented part.
- `demoSinkConfig` is read by the seeder and by the development doubles. The doubles exempt this origin from the SSRF address check, since the sink is on loopback or a private compose address. Production code never reads it.
