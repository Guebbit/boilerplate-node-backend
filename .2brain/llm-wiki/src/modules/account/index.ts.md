---
source: src/modules/account/index.ts
generated_at: 2026-11-22T03:29:49.649773+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/index.ts

## Purpose
Public barrel for the `account` module. It is the only surface sibling modules may import from, and it re-exports the module's services, domain, emails, events and model types. Internal parts are deliberately left out.

## Key elements
- `export * from './services'` — public services (the header names `accountService` and `twoFactorService`).
- `export * from './domain'` — domain exports.
- `export * from './emails'` — account email exports.
- `export * from './events'` — account event exports.
- `export type * from './model'` — model types only, with no runtime values.

## Relationships
- Re-exports from `src/modules/account/domain/index.ts`, `src/modules/account/emails.ts`, `src/modules/account/events.ts`, `src/modules/account/model.ts` and `src/modules/account/services/index.ts` in the same module.
- Neighbors outside the module (`src/modules/api-keys`, `src/modules/invoicing`, `src/modules/orders`, `src/modules/shop`, `src/app/config-routes.ts`) appear in the dependency graph as related files. Consumers are expected to go through this barrel rather than reach into account internals.

## Notes
- Deliberately not published:
  - `session/`'s token surface, because every request goes through `src/kernel/authentication.ts`.
  - `oauth/` and `two-factor/`, which are reached only through `accountService`/`twoFactorService`.
  - The export build (`services/export*.ts`), because it reaches every sibling's data.
- Adding an export here widens the cross-module API. The file header links to two docs for the rules: `docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel` and `docs/modules/account.md#its-neighbourhood`. Neither could be confirmed as a file in this repository.
