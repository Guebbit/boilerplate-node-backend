---
source: src/modules/users/index.ts
sha256: 61e34b5ca11c086d19d23f5cb6c4f8ac4786ff3eefdddcd5827980dd37dcc7ef
generated_at: 2026-10-15T12:08:02.097043+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/index.ts

## Purpose

Public barrel for the `users` module. It is the **only** import surface exposed to sibling modules (per the rule in `docs/theory/strategic-ddd.md` §5). The `account` module imports exclusively through this file; no other entry point exists.

## Key elements

- **`export * from './services'`** — re-exports the public service layer (including `userService`), the sole gateway for all user reads and writes.
- **`export * from './events'`** — re-exports domain events emitted by the module.
- **`export type * from './model'`** — re-exports the Zod schema types (the "schema's Zod twin") so consumers can type-check payloads without importing the runtime model.
- **`userRepository`, `userModel`** — deliberately *not* re-exported. They remain internal to the module.

## Relationships

- **`src/modules/account/module.ts`** and all `src/modules/account/services/*` / `src/modules/account/controllers/*` import from this barrel (services, events, or types) to authenticate users, read or mutate the shared user document, and handle signup / login / password-reset / email-change / deletion / export flows. They never reach past this file into `userRepository` or `userModel`.

## Notes

- `userModel` is unexported by design: nothing outside this module calls it directly. Every cross-module read or write—`account`'s included—must go through `userService`.
- This file is the concrete enforcement point of the users↔account "shared-kernel" boundary: widen the exports here and you widen the API surface every sibling module can touch.
