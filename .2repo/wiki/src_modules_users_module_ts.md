# src/modules/users/module.ts

## Purpose

Registration manifest for the **users** module. It declares the module's identity, mounts the router at `/users`, wires in seed helpers and demo shapes, and satisfies the `AppModule` contract consumed by the kernel registry. The module owns the user *record* (admin search, read, write, soft-delete) and is deliberately a **leaf** in the domain graph: other modules (e.g. cart) depend on it, never the reverse.

## Key elements

- **`default export`** — An object `satisfies AppModule` carrying:
  - `name: 'users'`, `subdomain: 'generic'`, `basePath: '/users'`
  - `routes` — imported from `./routes`
  - `seeds` / `seedExport` — `seedUsersCollection` and `exportSeededUsers` from `./demo`
  - `demoShapes` — maps the `users` collection to a `'response'` shape for `GET /users/:id`
  - `locales` — path to a `locales/` directory alongside this file
- **`import './events'`** (side-effect) — registers event handlers (e.g. `user.deleted`) without a named binding.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/modules.ts`** — top-level loader that imports this module's default export to build the application module map.
- **`src/modules/users/routes.ts`** — supplies the `router` attached to the module's `basePath`.
- **`src/modules/users/demo.ts`** — supplies the seed and seed-export functions.
- **`src/modules/users/events.ts`** — side-effect import; registers `user.deleted` and related handlers that other modules (cart, delivery, payments) subscribe to.
- **Integration tests** (`cart`, `delivery`, `payments`, `products` test suites) — consume the users module (or its barrel) to create user fixtures; they are downstream consumers, not co-owners of the record.

## Notes

- **No aggregates live here.** The `generic` subdomain flag signals that the user record is a ubiquitous, undifferentiated entity; the codebase keeps it as a plain document rather than an aggregate root.
- **Decoupling via events, not imports.** Cart cleanup on account deletion is triggered through the `user.deleted` event so the dependency arrow stays *cart → users*. The users module never imports cart.
- **Authentication is out of scope.** Signup, login, password reset, and token lifecycle belong to the `account` module, which reaches into this module's barrel only for the record it authenticates.
- The `locales` path is resolved with `__dirname`, so it assumes a CommonJS (or CJS-compat) build target rather than pure ESM.
