# src/modules/account/services/tokens.ts

## Purpose

Single owner of the user's `tokens` array for all non-password flows (reset, verification, delete confirmation, refresh sessions). Defines what "live" means, provides find/spend primitives, and shapes the session list exposed by `GET /account/sessions`. Keeping both halves of the live-token rule in one module so callers never reach into the users module directly.

## Key elements

- **`findLiveToken(type, token)`** — Resolves the `UserDocument` holding a live token of the given type *without* spending it. Live = exists in `tokens[]`, correct type, not expired. An absent `expiration` means "never expires." Returns `undefined` for every refusal reason (not found, wrong type, expired, token not in the loaded array).
- **`spendLiveToken(user, token)`** — Atomically removes the token by delegating to `userService.consumeToken` (the `$pull`). Returns `true` only for the request that actually performed the write; a `false` means this caller lost a race and is indistinguishable from a token that never existed.
- **`toSession(token, cookieToken?)`** *(private)* — Maps one stored refresh-token subdocument to the wire `Session` shape. Marks `current` by hashing the caller's cookie and comparing to the stored digest. Omits `expiration` / `lastUsedAt` keys when absent.
- **`sessionsList(userId, cookieToken?)`** — Loads the authenticated user's document, filters `tokens[]` to non-superseded `REFRESH` entries, maps them via `toSession`, and returns a `ResponseSuccess<{ sessions }>` or a 404 reject.

## Relationships

- **`src/modules/users/index.ts`** — Re-export source for `userRepository`, `userService`, `TokenType`, `hashToken`, and the `Token` / `UserDocument` types used throughout.
- **`src/modules/users/repository.ts`** — `userRepository.findByToken` (used by `findLiveToken`) and `userRepository.findByIdWithCredentials` (used by `sessionsList`).
- **`src/modules/users/service.ts`** — `userService.consumeToken` is the atomic spend that `spendLiveToken` delegates to.
- **`src/modules/users/model.ts`** — Origin of the `Token`, `UserDocument`, `TokenType`, and `hashToken` symbols (re-exported via the users index).
- **`src/infrastructure/http/response.ts`** — `generateSuccess`, `generateReject`, and the `ResponseSuccess` / `ResponseReject` wrapper types shape every return value in this file.
- **`src/infrastructure/i18n/index.ts`** — `t()` is used for the 404 message string.
- **`src/types/index.ts`** — Provides the `Session` wire type that `toSession` and `sessionsList` produce.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this module's public API.

## Notes

- **Tokens are hashed at rest (wave 3.1).** Every comparison against `token.token` in the loaded document must first call `hashToken(rawValue)`. `toSession` and `findLiveToken` both do this; missing the step silently breaks the match.
- **Absent `expiration` ≠ expired.** A non-positive TTL is stored as no `expiration` key. Treating a missing value as "expired" would revoke exactly those tokens.
- **`tokens` is `select: false`** on the user document. The only way to read it is `findByIdWithCredentials`; a plain `findById` will not include the array.
- **`supersededAt` entries (wave 3.2)** are retained for a short reuse-detection grace window. They are *not* sessions and are excluded from `sessionsList` by the `!token.supersededAt` filter.
- **No reason codes on refusal.** Both `findLiveToken` (all `undefined` paths) and `spendLiveToken` (race loser) collapse to the same observable result as "token never existed." Callers cannot distinguish expired, wrong-type, or lost-race.
- **`lastUsedAt` is optional.** A refresh token that has never been exchanged has no `lastUsedAt`; the wire `Session` omits the key rather than defaulting it to the issuance time.
