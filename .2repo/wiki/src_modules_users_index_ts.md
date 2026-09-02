# src/modules/users/index.ts

## Purpose

Public barrel for the `users` module. It is the **only** entry point a sibling module may import from (enforced by lint); reaching into `@modules/users/service` or other internals is a compile-time error. It re-exports the subset of the module's API that other modules legitimately need, and importing it also installs the event-payload type declarations.

## Key elements

- **`userService`** (`./service`) — business-logic service for user records.
- **`userRepository`** (`./repository`) — data-access layer; the `account` module imports this as a second service over the same record.
- **`TokenType`, `zodUserSchema`, `hashToken`** (`./model`) — model-level constants, validation schema, and token-hashing utility.
- **`UserDocument`, `Token`** (`./model`, types only) — document/token type shapes for consumers.
- **`USER_DELETED`, `USER_SETUP_REQUESTED`** (`./events`) — event-name constants emitted by this module; importing the barrel registers their payload declarations.
- **Not exported:** `userModel` — intentionally private to the module.

## Relationships

- **`src/modules/account/*`** (controllers, services, `module.ts`): The `account` module is the primary consumer. It imports `userRepository` (and likely `userService`, token utilities) through this barrel. This is the single `shared-kernel` coupling tracked as `module-coupling-account` in `.dependency-cruiser.cjs`.
- **`scripts/reap-inactive-accounts.ts`**: Consumes this module's exports (e.g. `userRepository`, `userService`) to find and act on stale user records.
- **`src/modules/account/tests/*`** (contract, integration): Import the barrel to exercise `account` flows that depend on `users` types and services.

## Notes

- The barrel is deliberately wider than a typical one: exporting `userRepository` alongside `userService` is an acknowledged exception driven by the `account` module's need for direct record access.
- Event constants (`USER_DELETED`, `USER_SETUP_REQUESTED`) are exported *from* the barrel so that importing it is the single action required to pick up payload type declarations—do not import them from `./events` directly in sibling modules.
- `userModel` is intentionally absent from the exports; if a new consumer needs it, that is a design smell to push back on.
- Full module docs live at `docs/modules/users.md`.
