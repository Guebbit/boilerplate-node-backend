---
source: src/modules/account/tests/unit/key-ring.test.ts
source_sha256: 36c216ecd5a359ef4d572df0675fcfcd1e3f1c929218c8f079b8a63c2abb0025
context_sha256: 4a7620757e4565e4a52978857edc57dddad04b3b9062157d38af9998c39b2cbd
generated_at: 2026-11-22T04:06:18.952796+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/key-ring.test.ts

## Purpose
Unit tests for the pure `kid` (key ID) math in `src/modules/account/session/key-ring.ts`. The tests cover only key-ID derivation and lookup. No signing happens here.

## Key elements
- **`describe('keyId')`**
  - Same secret gives the same ID (stable).
  - Distinct secrets give distinct IDs, so two ring members can't collide and a token signed with one can't verify against the other.
  - The ID is derived from the secret, not from its position. Dropping the oldest ring entry must not repoint an existing token's `kid` at a different key.
- **`describe('keyForId')`**, using the ring `['newest-secret', 'oldest-secret']`:
  - Returns the ring member that a `kid` names. The test looks up `oldest-secret`.
  - Returns `undefined` for a `kid` that names no current member, such as a retired key. The caller is expected to turn this into a rejection, not a crash.
  - Returns `undefined` for an absent (`undefined`) `kid`. It must not default to `ring[0]`, because that would let an unkeyed forgery pass as signed by the newest secret.

## Relationships
- Imports `keyId` and `keyForId` from `@modules/account/session/key-ring` (`src/modules/account/session/key-ring.ts`), the only module under test.

## Notes
- The tests are pure and deterministic, with no mocks or I/O.
- The comments record security-relevant invariants: no collisions, no positional IDs, and no fallback to the newest key.
