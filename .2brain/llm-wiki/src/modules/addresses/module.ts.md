---
source: src/modules/addresses/module.ts
sha256: 8ee528b3dc664c407c1d091d57d6088d566aaa97a32649b6d32e958840d3c6cb
generated_at: 2026-10-15T10:18:02.859083+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/module.ts

## Purpose

Module manifest for the **addresses** book — the shipping-address collection a user's checkout resolves against. Declared as its own `AppModule` so that `cart`'s checkout (the only sibling consumer) never needs to import `account`, and so `users` reaches the data solely through the `personalData` hooks defined here rather than a direct import.

## Key elements

- **Default export (`AppModule`)** — the manifest object the kernel registry consumes. Fields:
  - `name: 'addresses'`, `basePath: '/account'` — registers the module and mounts its routes under the shared `/account` prefix.
  - `routes` — the Hapi router from `./routes.ts`.
  - `config` — a single `addressesConfig.slice` entry pulled from `./config.ts`.
  - `personalData[0]` — a `PersonalData` descriptor with three hooks:
    - `collect` — reads the user's addresses via `addressesGet` for data-export purposes.
    - `erase` — `addressesDeleteByUserId`; removes the book inside the same transaction as account destruction.
    - `minimise` — `addressesMinimise`; drops re-enterable convenience data on an idle account.
  - `reencrypt: reencryptAddressBooks` — re-encrypts all PII fields (name, street, city, zip, country, phone) when the global key rotates.
  - `locales` — path to a sibling `locales/` directory for i18n strings.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type this export satisfies; the registry is the consumer of the manifest.
- **`src/modules.ts`** — top-level module barrel that discovers/registers this file's default export.
- **`src/modules/addresses/service.ts`** — source of the four imported functions (`addressesGet`, `addressesDeleteByUserId`, `addressesMinimise`, `reencryptAddressBooks`).
- **`src/modules/addresses/routes.ts`** — supplies the `router` object wired into the manifest.
- **`src/modules/addresses/config.ts`** — supplies the `addressesConfig` object.
- **`src/modules/addresses/reencrypt.ts`** — implementation behind `reencryptAddressBooks` (re-exported through `service.ts`).
- **`src/modules/users/tests/integration/minimise.test.ts`** — exercises the `minimise` hook declared in this file's `personalData` entry.
- **`src/modules/addresses/tests/integration/reencrypt.test.ts`** — exercises the `reencrypt` hook.
- **`src/modules/account/module.yaml`** — the `account` module shares the same `/account` `basePath`; the two routers coexist because `getAuth` early-returns a single auth resolution (see `kernel/middlewares/authorizations.ts`).

## Notes

- The `/account` `basePath` is **intentionally shared** with the `account` module. Do not change it here without checking `getAuth`'s early-return logic in the authorization middleware, which is what keeps the combined auth cost at one resolution instead of two.
- All six address fields (name, street, city, zip, country, phone) are PII-encrypted; the `reencrypt` hook must be kept in lockstep with whatever schema `service.ts` writes.
- `minimise` is explicitly lighter than `erase`: it drops re-enterable data for *idle* accounts, whereas `erase` is the irreversible deletion tied to account destruction.
