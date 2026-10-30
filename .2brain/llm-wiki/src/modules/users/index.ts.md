---
source: src/modules/users/index.ts
sha256: aa18ec27acadd9d77c126bc18af888667834292ada66d3c9e5307316ed1a10da
generated_at: 2026-10-29T06:12:48.959132+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/index.ts

## Purpose
Public barrel (module boundary) for the `users` module. It is the **only** import surface available to sibling modules, enforcing the strategic-DDD rule that cross-module access goes through an explicit facade. It re-exports the service layer, the event definitions, and the schema's Zod types while keeping `userRepository` and the model's runtime strictly internal.

## Key elements
- `export * from './services'` — exposes the user service API (the sole write/read path for the user document, including on behalf of `account`).
- `export * from './events'` — exposes user-domain event types/definitions for event-driven consumers.
- `export type * from './model'` — re-exports only the **types** (Zod schema twins) from the model; the model's runtime (`userModel`) is deliberately **not** exported.

## Relationships
- **`src/modules/account/*`** (controllers, services, `module.ts`) — `account` is the sole cross-module consumer of this barrel. It imports the user service and user types from here to authenticate and co-administer the user document it shares with `users`. All of `account`'s reads/writes against the user document go through `userService` (exported via `./services`), never directly through `userRepository` or `userModel`.

## Notes
- `userModel` and `userRepository` are intentionally **not** re-exported. Any code outside `users` that needs the user document must route through `userService`.
- The `export type *` (not `export *`) from `./model` means only type-level symbols leak; importing a value from `./model` outside this module is a compile error.
- The file's JSDoc references `docs/theory/strategic-ddd.md` §5 for the import-boundary rule and `docs/modules/users.md` for module-level docs.
