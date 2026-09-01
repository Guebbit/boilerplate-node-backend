# src/modules/users/repository.ts

## Purpose

Persistence layer for the `users` collection. Wraps the standard CRUD provided by the shared `createRepository` factory with the credential reads and token-lifecycle operations that the `account` module needs across the shared-kernel boundary. Centralises the two `select: false` fields (`password`, `tokens`) into sanctioned helpers so that re-selection logic lives in one place.

## Key elements

- **`CREDENTIAL_FIELDS`** (`'+password +tokens'`) — the only string used to re-select the two schema fields that are excluded by default; used by every credential-aware finder.
- **`userRepository`** — the sole export. A `Repository<UserDocument>` (from the factory) extended with:
  - `updateMany` — batch update; explicit because Mongoose generics trigger TS7056 at the export boundary.
  - `findByIdWithCredentials` / `findOneWithCredentials` — standard finders that re-select `password` + `tokens`.
  - `findByToken(token, type)` — `$elemMatch` lookup so token value **and** type must match the same array entry; returns the holder with credentials.
  - `findByTokenValue(token)` — untyped revocation lookup (no `type` filter); used by the refresh flow to check whether a token still exists.
  - `tokenRemove(id, token)` — atomic `$pull` by user id + token value (spend a one-shot token).
  - `tokenRemoveByValue(token)` — atomic `$pull` by token value alone (single-session logout from the refresh cookie).
  - `tokenRemoveExpired()` — bulk `$pull` of all expired tokens; returns a plain count, not an HTTP status.
  - `tokenTouch(token)` — positional `$set` on `tokens.$.lastUsedAt` so concurrent refreshes don't overwrite each other.
  - `sessionRemove(id, sessionId)` — `$pull` one refresh token by sub-document `_id`, pinned to `type: refresh` so it cannot target reset/delete tokens.
  - `writebackImage` — conditional writeback of `imageUrl`/`thumbnailUrl` keyed on `pendingImageKey`; returns a boolean (`matchedCount > 0`) so a stale or duplicate job is a detectable no-op.

All token mutations pass `timestamps: false` because spending/expiring/touching a token is not an account edit.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, and the `Repository` type. The factory supplies the base CRUD object spread into `userRepository`.
- **`src/infrastructure/adapters/image.worker.ts`** — contributes the `ImageWriteback` type that `writebackImage` satisfies; the image-digest pipeline calls into this repository to persist finished thumbnails.
- **`src/modules/account/services/*`** (authentication, profile, tokens, token-cleanup, verification) — the primary consumers across the kernel edge. They call the credential and token helpers rather than issuing raw Mongoose queries.
- **`src/modules/account/session/jwt.ts`** — uses `findByTokenValue` for the refresh-token revocation check during token validation.
- **`scripts/backfill-image-thumbnails.ts`** — exercises the `writebackImage` path in bulk.
- **`src/modules/account/tests/**`** — integration and contract tests drive `findByIdWithCredentials`, `findByToken`, `tokenRemove`, `tokenRemoveByValue`, `tokenRemoveExpired`, `tokenTouch`, `sessionRemove`, and `writebackImage` to verify token-lifecycle invariants (idempotency, `modifiedCount` semantics, concurrent-refresh safety).

## Notes

- **Never** add `.select('+password')` or `.select('+tokens')` outside this file. The two `*WithCredentials` helpers and `findByToken`/`findByTokenValue` are the sanctioned entry points.
- `findByToken` uses `$elemMatch` deliberately. A naive `{ 'tokens.token': x, 'tokens.type': y }` filter would also match a document that holds token *x* as a reset token and token *y* as a delete token in separate array entries.
- `sessionRemove` pins `type: TokenType.REFRESH` in the `$pull` condition. This is a safety constraint, not an optimisation—without it a leaked sub-document id could revoke a pending reset or delete confirmation.
- `writebackImage` is conditional on `pendingImageKey` still equal to the job's `key`. This makes late or duplicate image-worker deliveries a `false` return rather than an overwrite, and a hard-deleted user a detectable miss.
- The explicit interface on `userRepository` (rather than letting TypeScript infer) exists because Mongoose's generic parameter list is too large for TS to serialise at an export boundary (TS7056). Do not "simplify" it back to inference.
