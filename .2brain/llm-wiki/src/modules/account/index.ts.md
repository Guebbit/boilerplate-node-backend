---
source: src/modules/account/index.ts
sha256: 3955cee78f7e6206ee97c5149f2ff65785a873f689a7f67e844d31c915ec1342
generated_at: 2026-11-08T04:10:03.659984+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/index.ts

## Purpose

Public barrel for the `account` module. Per the strategic DDD rule (see `docs/theory/strategic-ddd.md` §5), this file is the **only** entry point a sibling module is permitted to import from. It re-exports the module's public surface while deliberately withholding internal sub-surfaces.

## Key elements

- `export * from './services'` — re-exports the public service layer (e.g. `accountService`, `twoFactorService`).
- `export * from './domain'` — re-exports the domain layer (entities, value objects, domain services).
- `export * from './emails'` — re-exports account-related email templates/composers.
- `export * from './events'` — re-exports domain events emitted by account operations.
- `export type * from './model'` — re-exports **types only** (interfaces, type aliases) from the model layer; no runtime values are published.

## Relationships

- **Re-exports from** `./services`, `./domain`, `./emails`, `./events`, `./model` — these five files constitute the full public surface.
- **Imported by** sibling modules (`api-keys`, `shop`, `tasks`, `invoicing`, `orders`) as their sole entry point into account functionality, per the strategic boundary. `config-routes.ts` also consumes it for route wiring.
- **Not exported:** `session/` (token logic lives behind `kernel/authentication.ts`), `oauth/`, `two-factor/` (reached only via `accountService`/`twoFactorService`), and `services/export*.ts` (export build touches every sibling's data and must stay internal).

## Notes

- The model re-export is `export type *`, not `export *`. Consumers get compile-time shapes only; any runtime import from `./model` bypassing this barrel is a boundary violation.
- Adding a new sub-directory under `src/modules/account/` does **not** automatically make it public — you must add an explicit re-export here to publish it.
- The export-services directory (`services/export*.ts`) is intentionally excluded because it aggregates data across every sibling module; leaking it through the barrel would break the isolation contract.
