---
source: src/modules/account/index.ts
sha256: 4dcf96ea3bd88b1655a7ebb0ff9435f59945b0906fbbd391f1f0a2bacf710cc5
generated_at: 2026-10-14T08:40:19.493720+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/index.ts

## Purpose
Public barrel (re-export facade) for the account module. It is the **only** surface that sibling modules are permitted to import from (rule defined in `docs/theory/strategic-ddd.md` §5). It deliberately curates what is visible: internal sub-modules like `session/`, `oauth/`, `two-factor/`, and the export build (`services/export*.ts`) are intentionally **not** re-exported here.

## Key elements
- `export * from './services'` — surfaces `accountService` (and friends) defined in `src/modules/account/services/index.ts`.
- `export * from './emails'` — surfaces the account email-sending functions in `src/modules/account/emails.ts`.
- `export * from './events'` — surfaces account domain events from `src/modules/account/events.ts`.
- `export type * from './model'` — re-exports **types only** from `src/modules/account/model.ts`; no runtime values leak.

## Relationships
- **Direct re-export targets (the four lines above):** `services/index.ts`, `emails.ts`, `events.ts`, `model.ts`. Consumers of this barrel get those modules' APIs without importing the paths directly.
- **Sibling modules (api-keys):** `src/modules/api-keys/module.ts`, `src/modules/api-keys/services/api-keys.ts`, and `src/modules/api-keys/emails.ts` import account types/services through this barrel rather than reaching into internal paths.
- **Ops scripts:** `scripts/ops/reap-account-exports.ts`, `reap-inactive-accounts.ts`, `reap-previous-emails.ts`, and `reencrypt.ts` obtain account-model types and services via this barrel.
- **Integration tests** (`signup-grant-atomicity.test.ts`, `reencrypt.test.ts`, api-keys tests) reference the account surface through this barrel.

## Notes
- Only `./model` uses `export type *`; the other three use plain `export *`. If you add runtime values to `model.ts`, they will **not** be re-exported — switch to `export *` or add a named re-export.
- The docstring explicitly warns against adding re-exports for `session/`, `oauth/`, `two-factor/`, or `services/export*.ts`. If a new sibling needs one of those, the intended pattern is to call through `accountService` / `twoFactorService`, not to widen this barrel.
- See `docs/modules/account.md` for the broader module architecture.
