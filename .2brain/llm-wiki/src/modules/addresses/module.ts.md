---
source: src/modules/addresses/module.ts
sha256: 22e7342bd26805e6756137916ba7ef1ad70f98981ad2b29bee9cd216535b1ef6
generated_at: 2026-10-14T14:52:09.618433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/module.ts

## Purpose

Entry-point manifest for the **addresses** module. It assembles the module's route table, config slice, and `personalData` lifecycle hooks (collect / erase / minimise) into a single `AppModule` object so the kernel can register the module without the addresses code being imported directly by `users` or any other sibling.

## Key elements

- **`export default { … } satisfies AppModule`** — the sole export; a manifest object with:
  - `name: 'addresses'`, `basePath: '/account'`
  - `routes` — the Hono router from `./routes`
  - `config` — `addressesConfig.slice` from `./config`
  - `personalData[0]` — the hook set the `users` module invokes:
    - `collect` — returns the user's address list via `addressesGet`
    - `erase` — `addressesDeleteByUserId`; runs inside the same transaction as account destruction
    - `minimise` — `addressesMinimise`; drops the book for an idle account
  - `locales` — path to the `locales/` directory relative to this file

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type this file `satisfies`.
- **`src/modules/addresses/service.ts`** — source of the three functions wired into `personalData` (`addressesGet`, `addressesDeleteByUserId`, `addressesMinimise`).
- **`src/modules/addresses/routes.ts`** — source of the `router` attached to the manifest.
- **`src/modules/addresses/config.ts`** — source of `addressesConfig`, whose `.slice` is exposed as the module's config.
- **`src/modules/account/module.yaml`** — co-occupant of the `/account` URL prefix; the two routers resolve through a single `getAuth` pass (see `kernel/middlewares/authorizations.ts` early-return).
- **`src/modules/users/tests/integration/minimise.test.ts`** — integration test that exercises the `minimise` hook declared here.

## Notes

- `users` never imports this module directly; it reaches address data only through the `personalData.erase` / `minimise` / `collect` hooks. This keeps the dependency graph acyclic.
- The module deliberately re-uses the `/account` basePath alongside the `account` module. Mounting both routers under that prefix costs one auth resolution, not two, thanks to an early return in `getAuth`.
- `personalData` is an **array** (currently one entry) — the kernel iterates it, so additional sections can be appended without changing the registration shape.
