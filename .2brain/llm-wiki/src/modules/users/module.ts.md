---
source: src/modules/users/module.ts
sha256: a83a6c6df26fed885316ec6253c1e87ebaa838932cb35ae0ae2cf27d57bdd0ed
generated_at: 2026-10-15T12:08:38.198387+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/module.ts

## Purpose

Module manifest for the `users` domain: admin-facing search, read, write, and soft-delete of user records. It wires together the module's routes, repository, services, PII encryption, and personal-data lifecycle hooks (erase, minimise, re-encrypt) into a single `AppModule` export that the kernel registry consumes at boot.

## Key elements

- **`onRegistered(modules)`** — Called by the kernel after all modules are known. Resolves every enabled module's `personalData.erase` and `personalData.minimise` hooks via the registry and pushes the combined lists into the local `erasure-registry` singleton so the hard-delete path can fan out to all modules in one transaction.
- **`default export`** (satisfies `AppModule`) — The module manifest:
  - `name: 'users'`, `basePath: '/users'`
  - `routes` — re-exported from `./routes`.
  - `locales` — path to the module's locale directory.
  - `imageTargets` — registers `userRepository.writebackImage` as the image writeback target under the key `users`.
  - `personalData` — two export sections:
    - `profile` — returns the full user row with credentials via `userService.findByIdWithCredentials`; returns `undefined` if the row is gone, which causes the `account` module to answer 404 for this section.
    - `signInMethods` — returns linked providers and armed factors (no secrets) via `userService.exportSignInMethods`.
  - `reencrypt: reencryptUserPhones` — hook invoked when the PII encryption key is rotated.
  - `config: [usersConfig.slice]` — exposes the module's PII encryption-key configuration.
- **Side-effect import of `./events`** — registers event listeners at module load.

## Relationships

- **`src/kernel/registry.ts`** — Provides `resolvePersonalDataErasers`, `resolvePersonalDataMinimisers`, and the `AppModule` type used to satisfy the manifest shape.
- **`src/modules/users/config.ts`** — Supplies `usersConfig.slice`, the PII encryption key config slice embedded in the manifest.
- **`src/modules/users/erasure-registry.ts`** — Receives the resolved eraser/minimiser lists via `setPersonalDataErasers` / `setPersonalDataMinimisers` so the hard-delete service can invoke them.
- **`src/modules/users/repository.ts`** — `userRepository` is referenced for the image writeback target.
- **`src/modules/users/routes.ts`** — Provides the `router` attached to the manifest.
- **`src/modules/users/services/index.ts`** — Exports `userService` (profile, sign-in-method collection) and `reencryptUserPhones` (PII re-encryption hook).
- **`src/modules/users/services/reencrypt.ts`** — Implementation behind the `reencryptUserPhones` hook.
- **`src/modules/users/events.ts`** — Imported for side effects (event registration).
- **Integration tests** (`users/tests/integration/*`, `invoicing/tests/integration/*`, `stats/tests/integration/*`) — Exercise the hard-delete, re-encrypt, and minimise flows that depend on this manifest's wiring.

## Notes

- The `account` module writes to the **same** user document through the shared `userRepository`; there is no separate `users` collection. This is intentional — `users` and `account` are two views over one kernel document.
- `personalData.profile` returns `undefined` (not `null`) when the row is absent. `account`'s assembly specifically 404s on that section because a partial export without the profile row is meaningless.
- TOTP secrets on the user document belong to `account`'s re-encryption walk, not this module's `reencryptUserPhones` hook — only phone numbers are PII-encrypted here.
- The `imageTargets` key is literally the string `'users'`; it is the writeback registration point, not a database collection name.
