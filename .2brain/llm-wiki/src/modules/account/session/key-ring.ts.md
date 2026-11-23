---
source: src/modules/account/session/key-ring.ts
source_sha256: 30df339b7bac62e3d3171c3ec770e00e047ad4c3a26cbd16e55a05ba690536ac
context_sha256: 405ec1e34f864bbd5912b6921dd1746982993985f9b0c36181031aa79731c4e1
generated_at: 2026-11-22T03:47:44.163297+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/key-ring.ts

## Purpose
Defines how a signing secret gets a stable identifier (`kid`) and how a token's `kid` is resolved back to a ring member. It is pure (no signing calls), so the ring math can be tested without signing anything. The module doc points to a further write-up under the heading "the signing key is a ring, not a single secret".

## Key elements
- `keyId(secret)`: returns the first 16 hex characters of the SHA-256 digest of the secret. This value is stamped into a signed token's `kid` header so a verifier can find the right key without trying every one.
- `keyForId(ring, kid)`: searches the ring (ordered newest first) for the secret whose `keyId` equals `kid`. It returns `undefined` if none matches, including when `kid` is `undefined`.

## Relationships
- `src/modules/account/session/jwt.ts` is the consumer described in the module doc. It uses this file to find the ring member that a token's header names. The caller turns an `undefined` result into a rejection.
- Tests: `src/modules/account/tests/unit/key-ring.test.ts` covers this file directly. `src/modules/account/tests/unit/session-jwt.test.ts`, `src/modules/account/tests/integration/jwt.test.ts` and `src/modules/account/tests/integration/session-modes.test.ts` are graph neighbors that exercise it indirectly through JWT and session behavior.

## Notes
- The `kid` is derived from the secret's content, never its position in the ring. Dropping the oldest entry on rotation therefore cannot repoint an existing token's `kid` at a different key.
- An `undefined` result means the key was retired or the token carried no `kid`. The documented intent is "log in again", not a crash.
- `keyForId` recomputes `keyId` for each ring member on every lookup. It does a linear scan and no caching.
