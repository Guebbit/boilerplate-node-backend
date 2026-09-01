# src/modules/account/services/tokens.ts

## Purpose

Central owner of the user's `tokens` array. Every non-password flow (password reset, email verification, delete confirmation, refresh sessions) is an entry in that array, and "live" semantics are defined once here. Provides the find/spend pair used by one-time-link controllers and the `GET /account/sessions` service function.

## Key elements

- **`findLiveToken(type, token)`** — Looks up the user document holding a live token of the given type. Live = entry exists, type matches, and either has no `expiration` or is past it. Returns the document or `undefined` for every refusal reason (no user, no entry, expired). Does **not** mutate.
- **`spendLiveToken(user, token)`** — Atomically removes the token entry by delegating to `userService.consumeToken` (a `$pull`). Returns `true` only if *this* call's write removed the entry; `false` means a concurrent caller already spent it. Re-exported here so the find/spend pair is consumed from one module.
- **`toSession(token, cookieToken?)`** *(private)* — Maps a stored refresh token to the wire `Session` shape. The raw token value never escapes this function; the subdocument `_id` is the external handle. `current` is `true` only when the caller's refresh cookie matches. `expiration` and `lastUsedAt` are omitted (not zero-filled) when absent.
- **`sessionsList(userId, cookieToken?)`** — Service for `GET /account/sessions`. Loads the user via `findByIdWithCredentials` (because `tokens` is `select: false`), filters to `TokenType.REFRESH` only, maps through `toSession`, and wraps in `generateSuccess`. Returns a 404 reject with an i18n message if the user is not found.

## Relationships

- **`src/modules/users/index.ts` / `model.ts` / `repository.ts`** — Imports `userRepository`, `TokenType`, `Token`, `UserDocument`. Calls `findByToken` (find path) and `findByIdWithCredentials` (sessions path) on the repository.
- **`src/modules/users/service.ts`** — `spendLiveToken` delegates the atomic `$pull` to `userService.consumeToken`, keeping the write logic in the users module.
- **`src/infrastructure/http/response.ts`** — Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types to shape controller-agnostic return values.
- **`src/infrastructure/i18n/index.ts`** (via `context.ts`) — Calls `t()` for the 404 error message.
- **`src/types/index.ts`** — Imports the `Session` wire type used as the public shape of a listed session.
- **`src/modules/account/services/index.ts`** — This file's exports are re-exported through the account-services barrel.

## Notes

- **Separate find and spend on purpose.** Only the spend is atomic (`$pull`); the find is a plain read. `post-reset-confirm` needs to validate *before* spending, so the two steps must remain independently callable.
- **No-expiration ≠ expired.** A token entry with no `expiration` field is intentionally immortal (non-positive TTL). Treating its absence as "already expired" would revoke exactly those.
- **Refusal is opaque.** `findLiveToken` returns `undefined` for "no user", "wrong type", "expired", and "token not found" alike. Callers must answer with a single generic message to avoid user enumeration.
- **Race on spend is indistinguishable from a miss.** A `false` from `spendLiveToken` is the losing side of two simultaneous uses of one link; the controller should respond identically to a token that never existed.
- **`tokens` is `select: false`** in the user model. `findByIdWithCredentials` exists specifically to include it; a plain `findById` would return an empty array and silently break the sessions endpoint.
- **Sessions list hides one-time secrets.** Filtering to `REFRESH` only means a pending reset / verification / delete link does not appear in the list, so an attacker who somehow learns the user id gains no signal that an operation is in flight.
