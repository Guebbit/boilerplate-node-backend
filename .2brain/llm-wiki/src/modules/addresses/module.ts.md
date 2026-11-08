---
source: src/modules/addresses/module.ts
sha256: da1d775dc2f3ee9422b324675a76f42b24681165f9ebba36b73bd1cae339f416
generated_at: 2026-11-08T04:55:11.395428+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/module.ts

## Purpose

Module manifest for the address book (one document per user, used at checkout). It declares routes, config, personal-data lifecycle hooks, and PII re-encryption so the address book is a self-contained module: `cart`'s checkout is the only sibling consumer, and `users` reaches it solely through the `personalData.erase` hook below — no direct imports into or from `account`.

## Key elements

- **`export default {…} satisfies AppModule`** — the manifest object the kernel registry consumes. Fields:
  - **`name`** — `'addresses'`.
  - **`mounts`** — attaches `router` (from `./routes`) at `basePath: '/account'`.
  - **`config`** — registers `addressesConfig.slice` (from `./config`).
  - **`personalData[0]`** — the user-facing data lifecycle:
    - `collect` — returns the address list for a given `userId`.
    - `erase` — calls `addressService.removeByUserId` inside the account-destruction transaction.
    - `minimise` — drops the book for idle accounts (treated as first-to-evict convenience data).
  - **`reencrypt`** — delegates to `addressService.reencrypt`; all PII fields (name, street, city, zip, country, phone) are encrypted at rest.
  - **`locales`** — path to the module's locale directory.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type that the default export satisfies; the kernel reads this manifest to wire routes, config, and hooks into the running app.
- **`src/modules.ts`** — the module aggregator that imports this default export to register the `addresses` module alongside siblings (`cart`, `wishlist`, `payments`, `orders`, `account`).
- **`src/modules/addresses/config.ts`** — exports `addressesConfig`; the manifest registers its `slice` under `config`.
- **`src/modules/addresses/routes.ts`** — exports `router`; mounted at `/account` via the `mounts` array.
- **`src/modules/addresses/service.ts`** — exports `addressService`; the manifest delegates `collect`, `erase`, `minimise`, and `reencrypt` to it.
- **`src/modules/addresses/tests/integration/reencrypt.test.ts`** — exercises the `reencrypt` hook.
- **`src/modules/users/tests/integration/minimise.test.ts`** — cross-module test that drives the `minimise` hook through the users module.
- **`tests/integration/erasure.test.ts`** — integration test for the `erase` hook in the context of full account destruction.

## Notes

- Shares the `/account` URL prefix with the `account` module. Mounting both routers there costs **one** auth resolution, not two — `getAuth` in `kernel/middlewares/authorizations.ts` early-returns so the second router skips re-authentication.
- The module intentionally avoids an import edge to or from `account`. Cross-module interaction is exclusively through the `personalData` hook surface (the same pattern `cart`, `wishlist`, `payments`, and `orders` each use on their own collection).
- `openapi.yaml` (sibling file) documents the HTTP contract; it is not imported by this manifest.
