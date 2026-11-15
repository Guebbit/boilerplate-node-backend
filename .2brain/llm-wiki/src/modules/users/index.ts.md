---
source: src/modules/users/index.ts
sha256: d7fd08d183c1c363b572bf362a074b6d7099f02861866e39eaf014e52987356d
generated_at: 2026-11-14T22:22:32.198522+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/index.ts

## Purpose

Public barrel for the `users` module — the **only** import surface a sibling module (currently `account`) is allowed to use. It re-exports the module's public API (services, events, emails, model types) while deliberately keeping the repository, the model runtime, and the `friends/account.ts` step file internal. See `docs/theory/strategic-ddd.md` §5 for the governing rule.

## Key elements

- **`export * from './services'`** — exposes `userService` and any other service-layer functions; this is the primary entry point for sibling modules.
- **`export * from './events'`** — re-exports event types/emitters defined by the module.
- **`export * from './emails'`** — re-exports email-related helpers or templates.
- **`export type * from './model'`** — re-exports the Zod schema types (the "Zod twin") from the model file. Types only; the runtime model (`userModel`) is **not** exported.

## Relationships

All listed graph neighbors live in `src/modules/account/` and are the current consumers of this barrel:

- **Controllers** (`post-login.ts`, `post-login-2fa.ts`, `get-oauth-callback.ts`) and **services** (`login.ts`, `logout.ts`, `oauth.ts`, `password-reset*.ts`, `email-change.ts`, `account-deletion.ts`, `deletion-sign-in.ts`, `export-job.ts`, `caller.ts`) import `userService` (and related exports) through this barrel to perform authentication, password/email lifecycle, and data-export operations on the user document that `users` owns.
- **`src/modules/account/emails.ts`** likely imports or references email exports from this barrel.
- **`src/modules/account/module.ts`** is the module-registration entry point that wires the above services and controllers together.

## Notes

- `userRepository` and the model runtime are intentionally hidden — no sibling should reach for them. Sibling code goes through `userService`.
- `userModel` is unexported by design; nothing outside this module calls it.
- The barrel does **not** publish `friends/account.ts`; `account`'s internal steps remain behind that internal seam.
- Adding a new public symbol to `./services`, `./events`, or `./emails` automatically widens the barrel surface. Gate new exports through the barrel's JSDoc rule before committing.
- Architectural rationale is documented in `docs/theory/strategic-ddd.md` §5 and `docs/modules/users.md`; consult those before proposing changes to the export surface.
