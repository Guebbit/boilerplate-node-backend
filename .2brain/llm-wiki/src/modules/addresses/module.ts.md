---
source: src/modules/addresses/module.ts
sha256: 168d4b0108e080ecd91d42719cb60a8447fd05de9604244968b88dda2dec80a9
generated_at: 2026-09-23T18:20:29.634517+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/module.ts

## Purpose

Module manifest for the address book. Declares the routes, event subscriptions, personal-data collection hook, and locale path so the kernel can mount the module without the rest of the codebase importing the `account` module. Only `cart`'s checkout consumes addresses directly; `users` interacts solely via the event bus.

## Key elements

- **`export default { … } satisfies AppModule`** — The manifest object the kernel reads to wire the module.
- **`basePath: '/account'`** — Mount prefix; shared with the `account` module.
- **`routes: router`** — Re-exports the Express router defined in `./routes.ts`.
- **`personalData.collect`** — Returns the user's address list for data-export / GDPR requests.
- **`subscribe`** — Calls `onDomainEvent(USER_DELETED, …)` to cascade-delete a user's addresses when their account is destroyed.
- **`locales`** — Absolute path (`path.join(__dirname, 'locales')`) to the i18n directory.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that the manifest satisfies; the kernel consumes the exported object during boot.
- **`src/kernel/events.ts`** — Provides `onDomainEvent`, the subscription helper used inside `subscribe`.
- **`src/modules/users/index.ts`** — Exports the `USER_DELETED` domain-event constant that this module listens for.
- **`src/modules/addresses/service.ts`** — Source of `addressesGet` (data collection) and `addressesDeleteByUserId` (event handler).
- **`src/modules/addresses/routes.ts`** — Source of the `router` mounted under `/account`.
- **`src/modules/account/module.yaml`** — Co-occupies the `/account` URL prefix; see below for the auth-cost note.
- **`src/modules.ts`** — Aggregator that imports this default export alongside other module manifests.

## Notes

- **Shared `/account` prefix with `account`.** Two routers can mount there because `getAuth` (in `kernel/middlewares/authorizations.ts`) early-returns after one resolution, so mounting both routers costs a single auth check rather than two. Don't assume one module "owns" the prefix exclusively.
- **No direct import from `users`.** The `USER_DELETED` import is a constant (event name), not a service call — the actual dependency is the event bus, keeping the two modules decoupled.
- **`cart` is the only sibling that imports `addresses` directly.** If a new consumer appears, prefer the event bus or a service-level import rather than reaching into this module.
