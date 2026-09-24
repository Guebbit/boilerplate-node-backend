---
source: src/modules/users/module.ts
sha256: f568f00f4bea29e80139a5a3da1de64b9e62af5cb1cd09b366dd7bc3b48ef078
generated_at: 2026-09-23T19:33:26.258278+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/module.ts

## Purpose

Module manifest that registers the **users** module with the kernel: wires the router, service, repository, and events into a single `AppModule` export, and declares the module's permissions, personal-data export sections, image writeback target, and required configuration.

## Key elements

- **`ownSessions(tokens)`** — Filters `Token[]` down to live refresh sessions and maps them to the `ExportSession` shape (id, type, optional expiration/lastUsedAt). Used only by the `sessions` personal-data section.
- **`default` export** — An object `satisfies AppModule` with:
    - `name` / `basePath` — `'users'` / `'/users'`.
    - `permissions` — Four `users.any.*` keys; deletion of the module must also delete these keys (enforced by a cross-cutting test).
    - `routes` — Re-exports `router` from `./routes`.
    - `locales` — Path to `locales/` alongside this file.
    - `imageTargets` — Registers `userRepository.writebackImage` as the writeback target for the `users` image slot.
    - `personalData` — Two independent `collect` sections (`profile`, `sessions`), each calling `userService.findByIdWithCredentials`.
    - `requiredConfig` — Declares `NODE_PII_ENCRYPTION_KEY` (min 16 chars, placeholder detected).

## Relationships

- **`src/kernel/registry.ts`** — Imports the `AppModule` type that the default export satisfies; the registry is the consumer of this manifest.
- **`src/modules/users/routes.ts`** — Source of the `router` instance placed in the manifest.
- **`src/modules/users/repository.ts`** — Provides `userRepository`, referenced as the image writeback target (shared with `account`'s signup/profile flows).
- **`src/modules/users/service.ts`** — Provides `userService.findByIdWithCredentials`, called by both `personalData` collectors.
- **`src/modules/users/model.ts`** — Source of the `isLiveRefreshSession` predicate and `Token` type used by `ownSessions`.
- **`src/modules/users/events.ts`** — Side-effect import (registers the `user.deleted` event that triggers cart cleanup).
- **`src/types/index.ts`** — Source of the `ExportSession` type used to shape `ownSessions` output.

## Notes

- **Shared document with `account`.** The `account` module (authentication) writes to the _same_ user document via this module's `userRepository`; there is no separate collection. The module docblock calls this the "shared kernel."
- **`personalData` sections are independent by design.** Both `collect` callbacks call `findByIdWithCredentials` separately rather than sharing one query — intentional per `kernel/registry.ts` conventions, and a data export is not a hot path.
- **`profile` section returns `undefined` when the subject's row is deleted.** The `account` module's assembly layer answers 404 for this specific section; other sections would be meaningless without it.
- **`NODE_PII_ENCRYPTION_KEY` is co-declared with `addresses`.** The key guards phone-number encryption; it is never optional without this module (per `addresses`' `dependsOn`), so declaring it here covers both modules.
- **Permission keys are bidirectionally checked.** A cross-cutting test (`module-permissions.test.ts`) rejects a key in the shared permissions file whose owning module has been deleted, and rejects a module claiming a key the file does not attribute to it.
