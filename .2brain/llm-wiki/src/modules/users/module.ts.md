---
source: src/modules/users/module.ts
sha256: bf548798707cf7a5dfd7d4c75db20579e8195b70acd6a097906b7a4da1dc20c1
generated_at: 2026-09-27T15:38:02.921900+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/module.ts

## Purpose

The module manifest for the `users` module. It declares everything the kernel needs to wire up the module—routes, permissions, locales, image writeback targets, personal-data export sections, and required configuration—into a single `AppModule` object. It also resolves cross-module personal-data erasure hooks at registration time.

## Key elements

- **`onRegistered(modules)`** — Resolves every enabled module's `personalData.erase` hook via `resolvePersonalDataErasers` (from `@kernel/registry`) and injects the list into `./erasure-registry` so the hard-delete path in `./service.ts` can fan out erasures.
- **`ownSessions(tokens)`** — Filters a user's `Token[]` down to live refresh sessions (`isLiveRefreshSession`) and maps them to `ExportSession[]` with `id`, `type: 'refresh'`, and optional `expiration` / `lastUsedAt`.
- **`export default { … } satisfies AppModule`** — The manifest object: `name`, `basePath` (`/users`), `permissions` (four `users.any.*` keys), `routes`, `onRegistered`, `locales`, `imageTargets`, `personalData`, `requiredConfig`.
- **`personalData` sections** — Two independent `collect` functions (`profile` and `sessions`) that each call `userService.findByIdWithCredentials` to assemble export data for the subject.
- **`requiredConfig`** — Declares `NODE_PII_ENCRYPTION_KEY` (min length 16) as mandatory; shared with the `addresses` module via its `dependsOn` on `users`.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type (satisfied by the default export) and `resolvePersonalDataErasers` used in `onRegistered`.
- **`src/modules.ts`** — The top-level module aggregator; this file's default export is one entry in that list.
- **`src/modules/users/routes.ts`** — Source of the `router` assigned to the manifest's `routes` field.
- **`src/modules/users/repository.ts`** — Source of `userRepository`; its `writebackImage` method is registered as the module's image writeback target.
- **`src/modules/users/service.ts`** — Source of `userService`; used by both `personalData` section collectors.
- **`src/modules/users/model.ts`** — Provides `isLiveRefreshSession` and the `Token` type used by `ownSessions`.
- **`src/modules/users/erasure-registry.ts`** — Receives the resolved eraser list via `setPersonalDataErasers` so the service's hard-delete path can call each module's erasure hook.
- **`src/modules/users/events.ts`** — Side-effect import; registers the `user.deleted` event handler that empties the subject's cart.
- **`src/types/index.ts`** — Provides the `ExportSession` type used as the return type of `ownSessions`.
- **`tests/support/checkout-modules.ts`** — Test helper that registers this module (among others) for cross-cutting permission and config tests.

## Notes

- The `account` module writes to the same user document through this module's `userRepository`; there is no separate collection. The file docblock calls this the "shared kernel" and notes it is *not* expressed in the import graph.
- `account` reads through this module's barrel for the record it authenticates but never imports this file directly for writes.
- Each `personalData` section's `collect` is intentionally independent (re-queries rather than reusing the `profile` result); this is a deliberate design choice documented in the comment, not an oversight.
- Deleting this module also deletes its four permission keys; `tests/cross-cutting/module-permissions.test.ts` enforces the bidirectional invariant (no orphaned keys in the shared permissions file, no claimed-but-missing keys).
- `NODE_PII_ENCRYPTION_KEY` is declared here rather than in `addresses` because `addresses` hard-depends on `users`; declaring it once here covers both modules.
