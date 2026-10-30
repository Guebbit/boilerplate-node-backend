---
source: src/modules/users/authenticatable.ts
sha256: 0b0bcb10918e8c25486b9cbe7fae70ac758ece0bc5adaff3b8b1b9b01a8ae4be
generated_at: 2026-10-29T06:10:41.251224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/authenticatable.ts

## Purpose

Defines the single source of truth for "may this account authenticate?" as a matched pair: a Mongo filter for queries and a predicate for documents already loaded. This guarantees that a path that *queries* for an account and a path that *checks* an in-hand document can never disagree about a banned or soft-deleted account.

## Key elements

- **`AUTHENTICATABLE_FILTER`** (`{ active: { $ne: false }, deletedAt: null } as const`) — The Mongo clause applied to every login-adjacent lookup. Uses `$ne: false` (not `true`) so documents lacking an `active` field still pass; spells out `deletedAt: null` rather than relying on driver-`undefined` semantics.
- **`isAuthenticatable(user)`** — Predicate twin of the filter for an account loaded *without* the filter (refresh token validation, token mint, OAuth match by address). Returns `true` when `active !== false` and `deletedAt` is falsy.
- **`isRestorable(user, now?)`** — Determines whether an owner-scheduled deletion can still be undone: account is not banned, `deletedBy` is `'owner'`, a `purgeAt` exists, and `purgeAt > now`. A banned account is refused regardless; one past `purgeAt` is left to the purge job.

## Relationships

- **`src/modules/users/model.ts`** — Imports the `UserDocument` type; the predicates operate on `Pick<UserDocument, …>` subsets.
- **`src/modules/users/repository.ts`** — Consumes `AUTHENTICATABLE_FILTER` in account lookups.
- **`src/modules/users/services/index.ts`** — Aggregates user services that rely on these checks.
- **`src/modules/account/controllers/post-login.ts`**, **`post-login-2fa.ts`**, **`get-oauth-callback.ts`** — Login and OAuth entry points that gate on `isAuthenticatable` / the filter.
- **`src/modules/account/services/login.ts`**, **`oauth.ts`** — Service layer performing the authenticatable check during credential or OAuth validation.
- **`src/modules/account/services/deletion-sign-in.ts`** — Uses `isRestorable` to decide whether a sign-in should restore a soft-deleted account.
- **`src/modules/users/tests/integration/authenticatable.test.ts`** — Integration tests covering the filter and predicate behavior.
- **`src/modules/users/tests/integration/scheduled-deletion.test.ts`** — Exercises `isRestorable` against purge-schedule scenarios.

## Notes

- The filter deliberately uses `{ $ne: false }` for `active`. Do not "simplify" it to `active: true` — that would silently lock out documents that never received an `active` field.
- `deletedAt: null` in the filter is a deliberate choice over `undefined`; it matches both a missing field and an explicit `null` without depending on driver defaults.
- `isRestorable` accepts an optional `now` parameter (defaults to `new Date()`), making the check testable against a fixed clock.
