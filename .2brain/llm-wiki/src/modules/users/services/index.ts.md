---
source: src/modules/users/services/index.ts
sha256: ff7e5f87389b915bc28014d9408e2eaeb8841e23866ff1ff5a6af104affe94e4
generated_at: 2026-10-15T12:10:39.864097+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/index.ts

## Purpose

Barrel and service-facade for the users module. It aggregates admin CRUD, search, credential/2FA, signup, and reaper operations from the sub-files into a single `userService` object, and re-exports each function individually. Account controllers and services call through this surface; they never import the sub-files or the presenter directly.

## Key elements

- **`userService`** (const object) — the public API. A flat namespace of ~40 operations grouped by concern: reads (`search`, `getById`, `findByEmail`), writes (`create`, `update`, `updateById`, `remove`, `restoreById`), identity lookups (`findAuthenticatableById`, `findByOAuthIdentity`, `emailTaken`), credential/2FA mutations (`setPassword`, `persistTwoFactorMethods`, `reserveMfaAttempt`, `spendBackupCode`, …), signup (`registerSelfService`, `registerFromOAuth`, `buildSignupDecoy`, `linkOAuthAccount`, `unlinkOAuthAccount`), reaper (`findInactiveUnwarned`, `minimiseInactive`, …), and a few misc helpers (`enqueueIfPending`, `exportSignInMethods`, `touchApiKeyUse`).
- **Presenter helpers re-exposed via the service** — `toUser` (`presentUser`), `toUserContract`, `toUserContracts`, `userActionsFor`. These exist here because the persistence wall forbids controllers from importing `../presenter` directly.
- **Individual re-exports** — every sub-file function is also exported at module level (e.g. `export { setPassword } from './credentials'`). Test suites call these directly; the comment notes the barrel's surface must not shrink when a file moves.
- **`isAuthenticatable`** — re-exported from `../authenticatable` (one level up), making it part of this barrel's public surface.

## Relationships

- **Account controllers** (`get-account`, `post-signup`, `update-account`, `delete-account-request`) — call `userService.*` to perform reads, writes, and lookups; never reach into the sub-files.
- **Account services** (`login`, `logout`, `oauth`, `password`, `email-change`, `password-reset-request`, `export`, `export-job`, `caller`, `previous-email-cleanup`) — invoke specific `userService` methods (e.g. `findForLogin`, `setPassword`, `applyEmailChange`, `exportSignInMethods`) as the users-side of the shared-kernel split documented in `docs/theory/strategic-ddd.md` §5.
- **`account/module.ts`** — wires the controllers/services above to this module in the application's module graph.

## Notes

- **Dual export surface.** Both the bare re-exports *and* the `userService` object exist. If you add a new operation, add it to the `userService` object *and* (if it should be callable from tests) re-export it individually.
- **Presenter passthrough is intentional.** `toUser`, `toUserContract`, `toUserContracts`, and `userActionsFor` are thin aliases for `../presenter` functions. Do not remove them from `userService` without confirming no controller depends on them.
- **Not an implementation file.** All logic lives in the sub-files (`./read`, `./credentials`, `./signup`, `./reaper`, etc.). This file only re-exports and assembles. Moving a function to a new sub-file requires updating the import line and the `userService` entry; the re-export line is the public contract.
