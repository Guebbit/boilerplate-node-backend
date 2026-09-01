# src/modules/feedback/module.ts

## Purpose

Declares the manifest for the **feedback** module — an open contact form where anyone (with or without an account) can file a request and admins triage it. This file wires together the module's name, route table, and locale path into a single `AppModule`-shaped export so the kernel can register it.

## Key elements

- **default export** — An object literal satisfying `AppModule` (from `@kernel/registry`). Contains:
  - `name`: `'feedback'`
  - `basePath`: `'/feedback'`
  - `routes`: re-exported `router` from `./routes.ts`
  - `locales`: resolved path to a sibling `locales/` directory (via `path.join(__dirname, …)`)
- **`router`** (imported from `./routes.ts`) — The actual route handlers; not defined here.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type; this file's default export is type-checked against it with `satisfies`.
- **`src/modules/feedback/routes.ts`** — Source of the `router` value embedded in the manifest.
- **`src/modules.ts`** — Consumes this module's default export as part of the app's module collection.

## Notes

- The JSDoc explicitly marks this file as a **leaf in both directions**: it imports nothing beyond a type, a path helper, and the local router, and (per the doc comment) no other file imports it directly. Deleting the directory removes the feature with no ripple.
- Feedback records an **email address**, not a user ID, by design — the form is open to unauthenticated visitors, so no account relationship exists to delete.
- The `satisfies` keyword is used (not `: AppModule`) so the object keeps its literal types at the call site while still being checked structurally against the contract.
