# src/modules/account/services/tokens.ts

## Purpose

Centralizes the "token is live" rule (entry exists, type matches, not expired) that was previously copy-pasted across three controllers and a fourth inline check. Provides the canonical find/spend pair for non-password tokens (reset, verification, delete-confirmation, refresh) and the session-listing logic for `GET /account/sessions`, so every flow asks for the rule by name instead of re-deriving it.

## Key elements

- **`findLiveToken(type, token)`** — Read-only lookup: returns the `UserDocument` holding a live token of the given type, or `undefined` for every refusal (missing, wrong type, expired, already spent). Does **not** remove the entry.
- **`spendLiveToken(user, token)`** — Atomically removes the token via `userService.consumeToken` (backed by a `$pull`). Returns `true` only to the winner of a concurrent race; `false` is indistinguishable from a never-existed token.
- **`toSession(token, cookieToken?)`** *(private)* — Maps a stored `Token` subdocument to the wire `Session` shape. Never exposes the token value; uses `_id` as the handle. `current` is `true` only when the caller's refresh cookie matches.
- **`sessionsList(userId, cookieToken?)`** — Fetches the user's document with credentials, filters `tokens` to `TokenType.REFRESH` only, maps via `toSession`, and returns a `ResponseSuccess`/`ResponseReject` pair.

## Relationships

- **`@modules/users` (index, model, repository, service)** — Imports `userRepository` (for `findByToken`, `findByIdWithCredentials`), `userService` (for `consumeToken`), and the `Token`, `TokenType`, `UserDocument` types. This file is the single account-side caller of `consumeToken`; controllers do not reach the users module directly for token ops.
- **`@infrastructure/http/response`** — Imports `generateSuccess`, `generateReject`, and the `ResponseSuccess`/`ResponseReject` types used by `sessionsList`.
- **`@infrastructure/i18n`** — Imports `t` for the 404 message in `sessionsList`.
- **`@types`** — Imports the `Session` wire type that `toSession` and `sessionsList` produce.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this file so other account modules import from the services index rather than the path.

## Notes

- **`undefined` is the only refusal.** `findLiveToken` intentionally collapses "never existed", "wrong type", "expired", and "already spent" into one absent value so a dead link is indistinguishable from a fabricated one and the response never confirms an account exists.
- **Absent `expiration` means "never expires."** Tokens issued with a non-positive TTL are stored without an `expiration` field; treating the field's absence as "expired" would revoke exactly those.
- **The find/spend split is load-bearing.** `post-reset-confirm` must validate the new password *between* the two calls; a combined `findAndSpend` would either force validation after the burn or require a callback parameter.
- **`tokens` is `select: false`** on the user document. `sessionsList` uses `findByIdWithCredentials` specifically to surface the array; a plain `findById` would not include it.
- **`sessionsList` filters to `REFRESH` only.** Other token types (reset, verification, delete-confirmation) are one-time secrets in flight, not sessions; listing them would disclose that an operation is pending.
