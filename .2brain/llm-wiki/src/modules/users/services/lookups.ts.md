---
source: src/modules/users/services/lookups.ts
sha256: 18bb28f468ad2a58147e016a7996b78b36d48684ad7a1394405be40b7ab9c55d
generated_at: 2026-11-14T22:28:33.450498+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/lookups.ts

## Purpose

Read-side named lookups for the `account` domain (the shared-kernel "account" end described in `docs/theory/strategic-ddd.md` §5). Every function is a thin, single-purpose pass-through over `userRepository`, named for the question it answers. Writes are deliberately excluded: the design intent is that a sibling importing from the barrel can never obtain a raw `save`, `build`, `create`, or arbitrary-filter `findOneWithCredentials` handle through this module.

## Key elements

- **`findAuthenticatableById(id)`** — Returns an active, non-soft-deleted account by id.
- **`findByIdWithCredentials(id, session?)`** — Hydrates the full document including `select: false` fields (password hash, tokens, 2FA). Joins a Mongoose transaction session when provided.
- **`findForLogin(email)`** — Retrieves the credentialed account for an email/password sign-in. Excludes deactivated/soft-deleted accounts, *except* an owner-scheduled deletion still within its grace window (caller must distinguish via `isAuthenticatable` / `isRestorable`).
- **`findByOAuthIdentity(provider, providerId)`** — Same semantics as `findForLogin` but keyed on a federated identity; returns the account already linked to that provider + providerId.
- **`findByIdWithPendingEmail(id)`** — Hydrates the document with the pending-email-change field loaded.
- **`emailOrPendingEmailTaken(email, excludingId)`** — Checks whether an email (or its pending-change counterpart) is already in use by another account.
- **`emailTaken(email)`** — Simple duplicate-email pre-check used during signup.

## Relationships

- **`src/modules/users/repository.ts`** — Direct dependency. Every exported function delegates to a corresponding `userRepository` method; this file adds no query logic of its own.
- **`src/modules/users/services/index.ts`** — Barrel for the `services` folder; re-exports these lookups so callers import from the barrel rather than reaching into the file directly.
- **`src/modules/users/friends/account.ts`** — The `account` domain consumer. These lookups are the read operations that `account`-side code (auth, OAuth linking, 2FA, email change) calls.
- **`src/modules/users/module.ts`** — Module wiring; registers the services (including this file's exports) so they are available to the rest of the app.

## Notes

- **No write operations here by design.** The JSDoc explicitly warns that publishing a raw `save`/`build`/`create` or an unparameterised `findOneWithCredentials(where)` on the barrel would give any future sibling an arbitrary-mutation handle. Each function in this file takes *only* the fields its single caller actually has and performs *only* the one read its name promises.
- **Grace-window deletion is returned, not filtered.** Both `findForLogin` and `findByOAuthIdentity` intentionally return an account that is inside its owner-scheduled deletion grace period. The caller is responsible for telling it apart from a normal active account using `isAuthenticatable` / `isRestorable`.
- **`new Date()` is injected at call time** inside `findForLogin` and `findByOAuthIdentity` (passed as the "now" argument to the repository), so the grace-window check is anchored to the moment of the lookup, not to a fixed timestamp.
