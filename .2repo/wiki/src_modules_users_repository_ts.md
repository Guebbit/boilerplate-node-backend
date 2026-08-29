# src/modules/users/repository.ts

## Purpose

Data-access layer for user documents. Wraps the Mongoose `userModel` with standard CRUD (delegated to a base factory) plus the credential-specific reads and token-lifecycle writes that the account services need. It exists to centralise the one sanctioned re-selection of `select: false` fields (`password`, `tokens`) and to express every token mutation as an atomic positional update rather than a read-modify-write.

## Key elements

- **`CREDENTIAL_FIELDS`** (`'+password +tokens'`) — the single string used by every method that must surface the hidden fields; keeps the `select` re-enablement in one place.
- **`userRepository`** (exported const) — the full repository object:
  - *Base CRUD* (inherited from `createBaseRepository`) — `find`, `findById`, `create`, `update`, `deleteOne`, etc., with a `searchable` config exposing `objectIds`, `text`, `regex`, and `booleans` (`active`, `admin`, `verified`).
  - **`updateMany(filter, update)`** — bulk update passthrough.
  - **`findByIdWithCredentials(id)`** / **`findOneWithCredentials(where)`** — fetch a user *with* password and tokens; the only sanctioned credential reads.
  - **`findByToken(token, type)`** — fetch the user holding a token of a specific type (uses `$elemMatch`); includes credentials so callers can read the entry's expiration.
  - **`tokenRemove(id, token)`** — atomic `$pull` of one token by user id + value; idempotent.
  - **`tokenRemoveByValue(token)`** — atomic `$pull` by token value alone (single-session logout; no user id required).
  - **`tokenRemoveExpired()`** — collection-wide sweep of expired tokens; returns `modifiedCount`.
  - **`findByTokenValue(token)`** — untyped-by-kind revocation lookup ("does this credential still exist?").
  - **`tokenTouch(token)`** — positional `$set` of `lastUsedAt` on the matched token entry.
  - **`sessionRemove(id, sessionId)`** — revoke one `refresh`-type token by its subdocument id, scoped to the owner's document.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — provides `createBaseRepository`, `toObjectId`, and the `BaseRepository<T>` interface. `userRepository` spreads the factory output and augments it with the credential/token methods above.
- **`src/modules/account/services/authentication.ts`** — calls `findByIdWithCredentials` during login.
- **`src/modules/account/services/verification.ts`** — calls `findByToken` + `tokenRemove` for reset-confirm / delete-confirm flows.
- **`src/modules/account/services/tokens.ts`** — calls `tokenRemove`, `findByTokenValue` for token lifecycle.
- **`src/modules/account/session/jwt.ts`** — calls `findByTokenValue` (revocation check) and `tokenTouch` (refresh) during the JWT refresh flow.
- **`src/modules/account/services/token-cleanup.ts`** — calls `tokenRemoveExpired` for the scheduled housekeeping sweep.
- **`src/modules/account/services/profile.ts`** — calls `findByIdWithCredentials` / `findOneWithCredentials` for password change.
- **`src/modules/account/tests/**`** — integration and unit tests exercise the above methods end-to-end and in isolation.

## Notes

- `password` and `tokens` are `select: false` on the schema. Plain `findById`/`find` will **never** return them; you must go through `*WithCredentials` or `findByToken`.
- `findByToken` deliberately uses `$elemMatch`. The naïve two-dotted-path form (`{ 'tokens.token': v, 'tokens.type': t }`) would match a user who holds the value in one entry and the type in another — a false positive during concurrent reset+delete.
- Every token mutation passes `timestamps: false`. The convention: token lifecycle events are not account changes and must not bump `updatedAt`.
- `tokenRemoveExpired` returns a plain `number` (the count). It does **not** return an HTTP status or error shape; the calling service decides what the count means.
- The `searchable.booleans.active` filter targets the `active` column, not `deletedAt`. "Deactivated" and "deleted" are distinct states.
- The `userRepository` type is written out explicitly (not inferred) because Mongoose's generics are too large for TS to serialise at an export boundary (TS7056).
