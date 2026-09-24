---
source: src/modules/users/index.ts
sha256: 4979e638cd7f85a2df7b7b5a4aee380e0921df7c61293a1bc838ffb84ab1c18c
generated_at: 2026-09-23T19:32:54.290231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/index.ts

## Purpose

Public barrel for the `users` module. It is the **only** import surface a sibling module (in practice, `account`) is permitted to use, enforcing the strategic-DDD boundary described in `docs/theory/strategic-ddd.md` §5. It re-exports the service, domain events, and a narrow set of model helpers while keeping `userRepository` and the model's runtime internals private to the module.

## Key elements

- **`export * from './service'`** — re-exports the full `userService` API. All cross-module reads and writes (including those made by `account`) must go through this service; the repository is never exposed.
- **`export * from './events'`** — re-exports user domain events for consumption by other modules.
- **Named model exports** (`TokenType`, `zodUserSchema`, `hashToken`, `isLiveRefreshSession`) — the token-type enum, the Zod schema, and two pure helpers that travel with the schema. These are the only model values exposed outward.
- **`export type * from './model'`** — all model *type* definitions (interfaces, type aliases) are re-exported as types only.
- **`userModel`** is deliberately **not** exported; nothing outside this module calls it.

## Relationships

This barrel is the sole import edge from `account` into `users`. Every file under `src/modules/account/` (controllers, services, and `module.ts`) that needs user data or events imports from this index rather than reaching into `./service`, `./model`, or `./events` directly. The two scripts (`scripts/db/access-grant.ts`, `scripts/ops/reap-inactive-accounts.ts`) also consume these exports for operational access to user data.

## Notes

- The `account` ↔ `users` pairing is described as the repo's one **shared-kernel** relationship: `account` authenticates and co-administers the same user document that `users` owns.
- The design rule is explicit: even `account` must go through `userService` for every read or write; it must not touch the repository or model runtime directly.
- Because this is a barrel, adding a new `export` here widens the public API surface for every sibling module. Treat new re-exports as a boundary decision.
