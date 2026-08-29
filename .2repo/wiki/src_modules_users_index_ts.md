# src/modules/users/index.ts

## Purpose

Public barrel for the `users` module. It is the **only** import surface a sibling module is allowed to use; lint rejects any path that reaches into `@modules/users/service`, `./repository`, etc. directly. The surface is deliberately wider than typical because `account` operates as a second service over the same User collection (signup, login, password reset) and needs the repository, not just the service.

## Key elements

- **`userService`** — re-exported from `./service`; the business-logic entry point.
- **`userRepository`** — re-exported from `./repository`; the sole sanctioned data-access path.
- **`TokenType`, `zodUserSchema`** — value re-exports from `./model` (enum + Zod schema).
- **`UserDocument`, `Token`** — type-only re-exports from `./model`.
- **`USER_DELETED`** — event constant from `./events`. Importing the barrel is also what installs the event payload declaration.

## Relationships

- **`account/module.ts`** — declares the dependency on this barrel as a `shared-kernel` edge; the wide surface here and the label there are the same fact written in two places.
- **`account/services/authentication.ts`, `profile.ts`, `tokens.ts`, `verification.ts`** — consume `userService` and/or `userRepository` for signup, login, password reset, and profile operations.
- **`account/session/jwt.ts`, `account/services/token-cleanup.ts`** — previously called `userModel` directly (`findOne`, `updateOne`, `updateMany`); now routed through `userRepository`. Their presence in the graph reflects that history.
- **`account/tests/integration/*` and `account/tests/contract/*`** — exercise the cross-module flows (JWT lifecycle, persisted locale, self-service, service contracts) that depend on this surface.

## Notes

- **`userModel` is intentionally absent.** Its removal closed a second door to the User collection from non-repository files. `published-language.test.ts` guards against re-exporting it.
- **Width is by design, not oversight.** The barrel is wide because two modules share one entity; the `shared-kernel` label in `account/module.ts` makes that trade-off visible on the context map rather than only to whoever opens this file.
- Importing this barrel has a side effect: it registers the `USER_DELETED` event payload declaration.
