# src/modules/users/module.ts

## Purpose

Module manifest for the **users** module. Wires together the user record's routes, demo seeding, locale files, and image writeback into a single `AppModule` export that the kernel registry consumes at startup. It also documents the module's position in the dependency graph: it reaches nothing, and is reached by `account`, `cart`, `delivery`, `payments`, and `wishlist`.

## Key elements

- **`default export`** — An object `satisfies AppModule` containing:
  - `name: 'users'`, `basePath: '/users'`
  - `routes` — re-exported from `./routes`
  - `seeds` / `seedExport` — `seedUsersCollection` / `exportSeededUsers` from `./demo`
  - `demoShapes` — maps `users` to `'response'`, meaning `GET /users/:id` returns the serialized document as-is
  - `locales` — path to the module's `locales/` directory
  - `imageTargets.users.writeback` — delegates to `userRepository.writebackImage` (shared with `account`)
- **Side-effect import `./events`** — registers the `user.deleted` event handler (cart-clearing on soft-delete) at module load.
- **`userRepository`** (from `./repository`) — used directly here only for the image writeback target; the same instance is also used by the `account` module for signup and profile-update writes.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that this file's export must satisfy.
- **`src/modules.ts`** — top-level module list that imports this file's default export to register the `users` module with the kernel.
- **`src/modules/users/routes.ts`** — source of the `router` object passed into the manifest.
- **`src/modules/users/repository.ts`** — source of `userRepository`; its `writebackImage` method is exposed as the module's image target.
- **`src/modules/users/demo.ts`** — source of the seed functions and the seed-export helper.
- **`src/modules/users/events.ts`** — imported for side-effects; registers the `user.deleted` event that clears a user's cart.
- **`src/modules/cart/tests/integration/*.test.ts`**, **`src/modules/delivery/tests/integration/service.test.ts`**, **`src/modules/payments/tests/integration/service.test.ts`**, **`src/modules/products/tests/integration/service.test.ts`** — integration tests in other modules that exercise flows touching the user record (e.g., cart clearing on `user.deleted`, payment/delivery lookups against a user id).

## Notes

- **Shared write path with `account`.** The `account` module writes the *same* user document through this module's `userRepository`. There is no separate `users` collection registered by `account`; both modules share this repository. Do not expect an independent write target in `account`'s manifest.
- **`imageTargets` is a single writeback.** Only `users` is listed; other modules that need image writeback register their own targets in their own manifests.
- **`user.deleted` is a soft-delete.** The doc comment calls it "soft delete"; the `events.ts` import is what makes the cart-clearing side-effect fire. Removing that import would break cart hygiene without any type error.
- **Six migrations** touch this collection (per the doc comment), the most of any collection in the project. Schema changes here have the widest blast radius.
