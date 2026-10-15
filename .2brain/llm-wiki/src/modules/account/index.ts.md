---
source: src/modules/account/index.ts
sha256: 3955cee78f7e6206ee97c5149f2ff65785a873f689a7f67e844d31c915ec1342
generated_at: 2026-10-15T09:56:56.183285+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/index.ts

## Purpose

Public barrel for the Account module. It is the **only** import surface that sibling modules (e.g. `api-keys`) are permitted to use, per the strategic-DDD rule in `docs/theory/strategic-ddd.md` §5. Internal sub-surfaces (`session`, `oauth`, `two-factor`, and the export-build services) are deliberately excluded so that cross-module access funnels through the service layer.

## Key elements

- `export * from './services'` — re-exports all public service entry points (e.g. `accountService`, `twoFactorService`).
- `export * from './domain'` — re-exports the domain layer (entities, value objects, domain events).
- `export * from './emails'` — re-exports email/template definitions used by the account flow.
- `export * from './events'` — re-exports domain event definitions.
- `export type * from './model'` — re-exports the data-model **types only** (no runtime values).

## Relationships

- **Direct re-exports (children):** `./services/index.ts`, `./domain/index.ts`, `./emails.ts`, `./events.ts`, `./model.ts`.
- **Consumers (siblings & scripts):** `src/modules/api-keys/module.ts`, `src/modules/api-keys/services/api-keys.ts`, `src/modules/api-keys/emails.ts`, and the integration tests (`api-keys.test.ts`, `outcomes.test.ts`, `signup-grant-atomicity.test.ts`) import account types/services through this barrel. Ops scripts (`reap-account-exports.ts`, `reap-inactive-accounts.ts`, `reap-previous-emails.ts`) also reference the module's public surface.

## Notes

- **Never published surfaces:** `session/` token utilities, `oauth/`, `two-factor/`, and `services/export*.ts` are intentionally *not* re-exported here. Sibling modules must go through `accountService` / `twoFactorService` for auth flows and must never touch export-build internals directly (they span all sibling data).
- The `model` export is `export type *`—importing from this barrel gives you types only; there is no runtime `model` object to call.
- For deeper module documentation, see `docs/modules/account.md` (referenced in the file header).
