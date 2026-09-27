---
source: src/modules/addresses/module.ts
sha256: b759a1802c4e8338d5e427d4cb1d1064e76fc619c4de841ad84c8e4db6f58d04
generated_at: 2026-09-27T14:38:47.431976+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/module.ts

## Purpose

Registers the **addresses** module with the application kernel: declares its HTTP routes, personal-data lifecycle hooks, and locale path. It exists as a standalone module so that `cart` (the only sibling consumer) and `users` (via the `personalData.erase` hook) never need to import `account` to reach address data.

## Key elements

- **`default export`** — an object typed `satisfies AppModule` (from `@kernel/registry`) that the kernel discovers at bootstrap.
  - `name: 'addresses'`
  - `basePath: '/account'` — shared URL prefix with the `account` module.
  - `routes` — the Express/Router instance imported from `./routes`.
  - `personalData` — a single section (`'addresses'`) providing:
    - `collect(subject)` — calls `addressesGet` and returns the user's address list.
    - `erase` — `addressesDeleteByUserId` from `./service`; runs inside the same transaction as the account deletion (DDD-D6).
  - `locales` — filesystem path to `./locales` for i18n strings.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type this file satisfies; the kernel consumes the default export to wire routes and hooks.
- **`src/modules.ts`** — aggregates module exports (this file is one of the entries it re-exports).
- **`src/modules/account/module.yaml`** — sibling module that shares the `/account` prefix; no import dependency between the two.
- **`src/modules/addresses/routes.ts`** — provides the `router` object mounted under `basePath`.
- **`src/modules/addresses/service.ts`** — provides `addressesGet` and `addressesDeleteByUserId` used by the `personalData` hooks.

## Notes

- **Shared prefix, single auth pass:** Both `addresses` and `account` mount under `/account`. The doc comment and `kernel/middlewares/authorizations.ts` (`getAuth` early-return) ensure mounting two routers there resolves auth once, not twice.
- **No import of `account`:** `users` erases addresses exclusively through the `personalData.erase` hook declared here; there is no direct module-to-module import. The same "hook-not-import" pattern is used by `cart`, `wishlist`, `payments`, and `orders`.
- **DDD-D6:** The `erase` function is documented as transactional with the parent account deletion — do not call `addressesDeleteByUserId` outside that flow without ensuring the same guarantee.
