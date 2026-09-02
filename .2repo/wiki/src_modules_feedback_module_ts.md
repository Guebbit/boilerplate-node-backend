# src/modules/feedback/module.ts

## Purpose

Module manifest for the **feedback** (contact-form) module. It registers the module's name, base path, Express router, and locale directory into the application's module registry. The module handles open contact requests (filed by anyone with or without an account) and admin-only triage.

## Key elements

- **Default export** — An object satisfying `AppModule` (from `@kernel/registry`) with:
  - `name: 'feedback'`
  - `basePath: '/feedback'`
  - `routes: router` (imported from `./routes`)
  - `locales: <abs path to ./locales>`
- **Doc comment** — Documents the module's position in the dependency graph: it *reaches* nothing; it is *reached by* the account module's data export (`findOwnTickets`), gated behind `NODE_EXPORT_INCLUDE_FEEDBACK` (default off).

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type used in the `satisfies` clause; this file is a concrete implementation of that contract.
- **`src/modules.ts`** — Aggregates all module manifests (including this one) so the kernel can mount them.
- **`src/modules/feedback/routes.ts`** — Supplies the `router` that this manifest attaches to the `routes` field.

## Notes

- This module records an **email address**, not a user ID. The doc comment explicitly states this is intentional (the form is open to unregistered users) and that deleting an account does *not* remove their feedback.
- The `findOwnTickets` call in the account module links a ticket to an account by guessing the email matches; the doc comment notes that guess is the **caller's** responsibility, not this module's.
- The module is described as a "leaf in both directions" — no internal module imports from it, and it imports from no other internal module beyond the registry type and its own routes file.
