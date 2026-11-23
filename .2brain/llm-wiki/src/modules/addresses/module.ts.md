---
source: src/modules/addresses/module.ts
source_sha256: a2e4ca0f976ed090c868af3bd389798484ddf0d3520b9526086c48739642b0d9
context_sha256: 628d6fe6ab99df4c6137bfeb1aa94d1cd78ca2cac51cec46717fda00a1a668fe
generated_at: 2026-11-22T04:14:07.436526+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/module.ts

## Purpose
Manifest entry for the `addresses` module, which owns the address book: one document per user holding the shipping addresses that checkout resolves against. It is a separate module so nothing needs to import `account` for it. The file wires the module's routes, config slice, personal-data hooks, re-encryption, and locales into the app registry.

## Key elements
- **Default export** (`satisfies AppModule`) — the manifest object:
  - `name: 'addresses'`.
  - `mounts` — mounts the router imported from the routes file at `/account`.
  - `config` — contributes the config slice from `addressesConfig`.
  - `personalData` — a single `addresses` section with three hooks:
    - `collect` returns `addressService.list(userId)`'s `addresses`.
    - `erase` calls `addressService.removeByUserId(userId, session)`. It runs inside the same transaction as account destruction.
    - `minimise` is `addressService.minimise`. The book is re-enterable convenience data, so it is the first thing an idle account drops.
  - `reencrypt` — `addressService.reencrypt`. Every entry's name, street, city, zip, country and phone are PII-encrypted.
  - `locales` — the `locales` directory next to the module, resolved from `__dirname`.

## Relationships
- `src/kernel/registry.ts` — supplies the `AppModule` type that the manifest must satisfy.
- `src/modules.ts` — the module list that registers this manifest.
- `src/modules/addresses/service.ts` — supplies `addressService`, which backs all the personal-data and re-encryption hooks.
- `src/modules/addresses/routes.ts` — supplies the `router` mounted at `/account`.
- `src/modules/addresses/config.ts` — supplies `addressesConfig`, whose `slice` is contributed as config.
- `src/modules/cart/module.ts` — the only sibling consumer, since checkout resolves shipping addresses from this book.
- The `users` module reaches this module only through the erase hook declared here, never by importing it.
- Tests that exercise these hooks: `src/modules/addresses/tests/integration/reencrypt.test.ts`, `src/modules/users/tests/integration/minimise.test.ts`, and `tests/integration/erasure.test.ts`.

## Notes
- The module shares the `/account` URL prefix with `account`. Mounting two routers there costs one auth resolution, because of `getAuth`'s early return in `src/kernel/middlewares/authorizations.ts`.
- The module has no import of `account` or `users`. Cross-module data handling goes through the declarative `personalData` hooks, the same pattern `cart`, `wishlist`, `payments` and `orders` use on their own collections.
- The doc comment on the export mentions event subscriptions, but the manifest declares none.
