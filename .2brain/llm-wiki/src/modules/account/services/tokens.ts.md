---
source: src/modules/account/services/tokens.ts
sha256: b2551dca382d1ae923807feed1d87a1cec5b2c08d8805f4a08ccc258c6b5aea5
generated_at: 2026-09-27T14:31:02.828068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/tokens.ts

## Purpose

Single owner of every non-password token flow on a user account (reset, verification, delete-confirmation, refresh sessions). Defines what "live" means in one place and exposes find / spend / redeem primitives plus the `GET /account/sessions` listing. Keeping the semantics here means `two-factor.ts` and the four confirm controllers all agree on expiry, hashing, and race-handling without duplicating the rules.

## Key elements

- **`findLiveTokenEntry(type, token)`** — Locates the account holding a live token of `type` *without* spending it. Returns `{ user, entry }` or `undefined` for every refusal. The `entry` is needed by `two-factor.ts` to read back `entry.amr` off an `MFA_CHALLENGE`.
- **`findLiveToken(type, token)`** — Thinner wrapper around the above; discards the entry and returns only the `UserDocument`.
- **`spendLiveToken(user, token)`** — Atomically removes the token via `userService.consumeToken`. Returns `true` only for the request whose own `$pull` won the race; `false` (race-loser) is indistinguishable from "token never existed."
- **`redeemLiveToken(type, token)`** — Composes find + spend in one call for the four confirm controllers that have no work of their own between the two steps.
- **`toSession(token, cookieToken?)`** *(module-private)* — Maps a stored refresh-token subdocument to the wire `Session` shape. The raw token value never appears in the output; the subdocument `_id` is the handle.
- **`sessionsList(userId, cookieToken?)`** — Public entry for `GET /account/sessions`. Filters to live refresh tokens only (other token kinds are one-time secrets, not sessions) and returns `ResponseSuccess | ResponseReject`.

## Relationships

- **`@modules/users`** (`service.ts`, `model.ts`) — Source of `userService`, `hashToken`, `isLiveRefreshSession`, `Token`, `UserDocument`. All read/write of the `tokens` array goes through `userService`; this file never touches the DB directly.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the API responses from `sessionsList`.
- **`@infrastructure/i18n`** — `t()` localises the "user not found" reject message.
- **`@types`** — `Session` type defines the wire contract for `toSession`.
- **`services/two-factor.ts`** — Consumes `findLiveToken` + `spendLiveToken` as separate steps (it performs MFA work between them). The `entry` returned by `findLiveTokenEntry` exists specifically for this caller.
- **`services/index.ts`** — Barrel re-exports this module's public functions.
- **`tests/unit/two-factor.test.ts`** — Exercises the find/spend path indirectly through the two-factor service.

## Notes

- **Tokens are hashed at rest.** `token.token` on the document is a digest. Always `hashToken(rawValue)` before comparing or looking up.
- **Absent `expiration` = never expires.** This is how a non-positive TTL is stored. Treating a missing field as "already expired" would silently revoke those tokens.
- **Race losers are silent.** `spendLiveToken` → `false` and "token never existed" produce the same `undefined` from `redeemLiveToken`. There is no distinct error path for double-use.
- **`tokens` is `select: false`** on the user model. Any query that needs them must explicitly request the field (as `findByIdWithCredentials` does); a plain `findById` will not include them.
- **`current` flag is cookie-based.** Bearer-only callers (no refresh cookie) will see `current: false` on every row — by design, not a bug.
- **`lastUsedAt` is omitted, not zeroed.** A session that has never been exchanged renders without the field rather than showing its issue time as a "last used" value.
