---
source: src/modules/users/index.ts
sha256: 0dd33fb4d37ad44f103579fbab15ba5252df639815db77e88200300190a7fbb6
generated_at: 2026-11-08T08:46:07.167487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/index.ts

## Purpose

Public barrel for the `users` module. It is the **only** import surface available to sibling modules (per `docs/theory/strategic-ddd.md` §5), re-exporting services, events, emails, and model types while keeping the repository and model runtime strictly internal.

## Key elements

- **`export * from './services'`** — exposes the user service layer (the sole write/read path for all external callers).
- **`export * from './events'`** — exposes user domain events.
- **`export * from './emails'`** — exposes user-related email definitions.
- **`export type * from './model'`** — exposes Zod schema types (the "Zod twin") for consumption at compile time; the model's runtime is **not** exported.

## Relationships

- **`src/modules/account/*`** (controllers, services, `module.ts`) — the `account` module is the sole external consumer of this barrel. It imports from here to authenticate, co-administer, and delete the user document. All its reads and writes route through the `userService` exported by `./services`; it never touches `userRepository` or the model runtime directly.

## Notes

- `userModel` (runtime) is deliberately **unexported**; only its type-level Zod twin leaks out via `export type * from './model'`.
- `userRepository` is internal to the module — even `account`'s service calls go through `userService`.
- This barrel is intentionally wider than a typical module boundary because `account` and `users` share a single domain-primitive (the user document); the docstring flags this as the one exception in the repo.
- For the full module-level narrative, see `docs/modules/users.md`.
