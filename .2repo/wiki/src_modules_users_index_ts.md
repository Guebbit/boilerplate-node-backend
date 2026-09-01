# src/modules/users/index.ts

## Purpose

Public barrel for the `users` module. It is the **only** import surface permitted for sibling modules—lint rules reject direct paths into `./service`, `./repository`, etc. It re-exports the handful of symbols other modules (primarily `account`) are allowed to consume.

## Key elements

- **`userService`** – the primary domain service; the main entry point for user operations.
- **`userRepository`** – data-access layer over the user record. Exported here specifically so `account` can act as a second service on the same record.
- **`TokenType`** – runtime enum/type discriminant for token kinds.
- **`zodUserSchema`** – Zod validation schema for user payloads (shared-kernel utility).
- **`UserDocument`, `Token`** *(types only)* – structural types for persistence and token entities.
- **`USER_DELETED`, `USER_SETUP_REQUESTED`** – event-name constants. Importing this barrel is what installs the event payload declaration (side-effect of the events module).

## Relationships

- **`src/modules/account/*`** (controllers, services, session, tests) – the `account` module imports `userRepository`, `userService`, `zodUserSchema`, and the event constants through this barrel. This is the declared `shared-kernel` coupling tracked as `module-coupling-account` in `.dependency-cruiser.cjs`.
- **`scripts/backfill-image-thumbnails.ts`** – one-off script that reaches into the users domain (likely `userRepository` or `userService`) for bulk thumbnail backfill.

## Notes

- `userModel` is intentionally **not** re-exported; nothing outside `users` should touch it.
- Importing the barrel carries a side-effect: it registers the event payload declaration. Do not tree-shake or partially re-import the events file elsewhere.
- Adding a new export here widens the public API surface—review against the `module-coupling-account` rule before doing so.
