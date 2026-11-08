---
source: src/modules/users/authenticatable.ts
sha256: 0b0bcb10918e8c25486b9cbe7fae70ac758ece0bc5adaff3b8b1b9b01a8ae4be
generated_at: 2026-11-08T08:43:21.450473+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/authenticatable.ts

## Purpose

Single source of truth for the "is this account allowed to authenticate?" check. It pairs a Mongo query filter with an in-memory predicate so that database lookups and post-load checks always agree on the state of banned or soft-deleted accounts, eliminating a class of disagreement bugs between the two code paths.

## Key elements

- **`AUTHENTICATABLE_FILTER`** (const) — The Mongo filter clause (`{ active: { $ne: false }, deletedAt: null }`) every login-adjacent query must include. Uses `$ne: false` so a missing `active` field is treated as enabled; uses `deletedAt: null` (not `undefined`) to explicitly match both absent and null fields.
- **`isAuthenticatable(user)`** (function) — Predicate twin of the filter for documents already loaded without the filter (e.g. an OAuth match by address, a refresh, a token mint). Returns `true` when `active !== false` and `deletedAt` is falsy.
- **`isRestorable(user, now?)`** (function) — Determines whether a self-scheduled deletion can still be undone: the account is not banned, was deleted by the owner (`deletedBy === 'owner'`), has a `purgeAt` timestamp, and that timestamp is still in the future.

## Relationships

- **`src/modules/users/model.ts`** — Provides the `UserDocument` type used in the function signatures.
- **`src/modules/users/repository.ts`** — Applies `AUTHENTICATABLE_FILTER` in login-adjacent queries (find by email, token lookups, etc.).
- **`src/modules/account/services/login.ts`** — Calls `isAuthenticatable` on a user document loaded without the filter (e.g. token validation path).
- **`src/modules/account/services/oauth.ts`** — Uses the filter/predicate when matching an account by address during the OAuth flow.
- **`src/modules/account/controllers/post-login.ts` / `post-login-2fa.ts` / `get-oauth-callback.ts`** — Downstream consumers that rely on the filter being applied by the repository or by an explicit predicate check.
- **`src/modules/account/services/deletion-sign-in.ts`** — Calls `isRestorable` to decide whether a self-deleted account can be re-activated before the purge deadline.
- **`src/modules/users/services/index.ts`** — Aggregates user services; may import or re-export these helpers.
- **`src/modules/users/tests/integration/authenticatable.test.ts`** — Integration tests covering both the filter and the predicate on real Mongo documents.
- **`src/modules/users/tests/integration/scheduled-deletion.test.ts`** — Exercises `isRestorable` against the lifecycle of a self-deleted account.

## Notes

- `AUTHENTICATABLE_FILTER` is intentionally **not** `{ active: true }`. A document with no `active` field is considered enabled; only an explicit `false` locks it out. Any new lookup must use `$ne: false` to preserve this behavior.
- `deletedAt: null` in the filter matches **both** a missing field and an explicit `null`. Do not replace it with `undefined`, whose matching semantics depend on driver defaults.
- `isRestorable` is the only export that accepts a `now` parameter (defaults to `new Date()`). Tests should inject a fixed date to make assertions deterministic.
- The module is pure (no I/O); it can be imported anywhere without side effects.
