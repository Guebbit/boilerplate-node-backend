---
source: src/modules/addresses/module.ts
sha256: da1d775dc2f3ee9422b324675a76f42b24681165f9ebba36b73bd1cae339f416
generated_at: 2026-10-29T03:08:27.094968+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/module.ts

## Purpose

Module manifest for the **addresses** collection (one document per user, holding shipping addresses that checkout resolves against). Declares the module's routes, config, PII lifecycle hooks, and locale path so the kernel can register everything without any consumer importing `account` or this module's internals directly.

## Key elements

- **`default` export** (`satisfies AppModule`) — the manifest object the kernel loads.
- **`mounts`** — registers `./routes`'s router under the `/account` base path (shared with the `account` module).
- **`config`** — exposes `addressesConfig.slice` for runtime configuration.
- **`personalData`** — the GDPR/erasure contract for the `addresses` section:
  - `collect` — returns the user's address list (via `addressService.list`).
  - `erase` — deletes all addresses in the same transaction as account destruction (`addressService.removeByUserId`).
  - `minimise` — drops the book when an account goes idle (`addressService.minimise`).
- **`reencrypt`** — hook for PII re-encryption of all address fields (`addressService.reencrypt`).
- **`locales`** — path to the module's locale directory.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/modules/addresses/service.ts`** — source of all business logic referenced by the manifest (`list`, `removeByUserId`, `minimise`, `reencrypt`).
- **`src/modules/addresses/routes.ts`** — supplies the Express router mounted at `/account`.
- **`src/modules/addresses/config.ts`** — supplies the module's config slice.
- **`src/modules/account/module.yaml`** — co-occupies the `/account` URL prefix; auth is resolved once for both routers (see `getAuth` early return in `kernel/middlewares/authorizations.ts`).
- **`src/modules/users/tests/integration/minimise.test.ts`** — exercises the `minimise` hook declared here.
- **`tests/integration/erasure.test.ts`** — exercises the `erase` hook declared here.
- **`src/modules/addresses/tests/integration/reencrypt.test.ts`** — exercises the `reencrypt` hook declared here.

## Notes

- The module deliberately avoids an import dependency on `account`; the only cross-module consumer is `cart`'s checkout, and `users` reaches addresses solely through the `personalData.erase` hook — the same pattern used by `cart`, `wishlist`, `payments`, and `orders`.
- All address fields (name, street, city, zip, country, phone) are PII-encrypted; the `reencrypt` hook covers the entire document.
- The `/account` prefix is shared with `account` by design; mounting two routers there costs one auth resolution, not two (early return in `getAuth`).
