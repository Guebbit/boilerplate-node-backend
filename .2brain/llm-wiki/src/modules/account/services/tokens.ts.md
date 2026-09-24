---
source: src/modules/account/services/tokens.ts
sha256: 4cfdcdceae6c8273c3febe86dd5215b4b5c2404d6153faf12812444028202890
generated_at: 2026-09-23T18:10:04.334073+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/tokens.ts

## Purpose

Single owner of all token-lifecycle logic for non-password account flows (reset, verification, delete-confirmation, refresh sessions). Defines what "live" means in one place, and exposes the find / spend / list operations that controllers and sibling services call instead of touching the user document directly.

## Key elements

- **`findLiveTokenEntry(type, token)`** — Loads the user holding a live token of `type`, re-hashes the raw token, and returns `{ user, entry }`. Returns `undefined` for every failure mode (no match, wrong type, expired). The `entry` is exposed so `verifyLoginChallenge` (in `two-factor.ts`) can read `entry.amr`.
- **`findLiveToken(type, token)`** — Thin wrapper over the above; returns only the `UserDocument`.
- **`spendLiveToken(user, token)`** — Delegates to `userService.consumeToken` (the `$pull` write). Returns `true` only for the winning write; `false` is indistinguishable from "token never existed" (race-loser).
- **`toSession(token, cookieToken?)`** *(private)* — Maps a `Token` subdocument to the wire `Session` shape. The token value never appears in the output; the subdocument `_id` is the identifier. `current` is set only when `cookieToken` hashes to the stored digest.
- **`sessionsList(userId, cookieToken?)`** — Returns `ResponseSuccess<{ sessions }>` or `ResponseReject`. Filters the user's tokens to live refresh sessions only, then maps via `toSession`.

## Relationships

- **`@modules/users`** (`src/modules/users/index.ts` → `service.ts`, `model.ts`) — Imports `userService` (for `findByToken`, `consumeToken`, `findByIdWithCredentials`), `hashToken`, `isLiveRefreshSession`, and the `Token` / `UserDocument` types. All DB I/O lives in the users module; this file is pure orchestration.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types used by `sessionsList`.
- **`@infrastructure/i18n`** — `t` for the 404 message in `sessionsList`.
- **`@types`** (`src/types/index.ts`) — `Session` wire type returned by `sessionsList`.
- **`src/modules/account/services/two-factor.ts`** — Consumes `findLiveTokenEntry` (the doc comment names `verifyLoginChallenge` as the caller that needs `entry.amr` on an `MFA_CHALLENGE` token).
- **`src/modules/account/services/index.ts`** — Barrel re-export; makes these functions available to controllers.

## Notes

- **Opaque failure.** `findLiveToken` / `findLiveTokenEntry` return `undefined` for *every* reason (user not found, token not in array, wrong type, expired). Callers cannot distinguish them; the HTTP layer must map them all to the same 404/400.
- **Absent `expiration` ≠ expired.** A missing `expiration` field means the token never expires (this is how a non-positive TTL is stored). Treating absent as expired would revoke exactly those tokens.
- **Tokens are hashed at rest.** Any comparison against `token.token` must go through `hashToken` first. The `toSession` mapping and `findLiveTokenEntry` both do this.
- **`tokens` is `select: false`.** The field is excluded from normal reads; `sessionsList` must use `findByIdWithCredentials` to retrieve it.
- **`sessionsList` intentionally omits one-time tokens.** Pending reset, delete, and verification entries are not "sessions" and listing them would disclose that an operation is in flight.
- **`lastUsedAt` is optional in the wire shape.** It is omitted (not set to `null`) until the token has been exchanged at least once.
