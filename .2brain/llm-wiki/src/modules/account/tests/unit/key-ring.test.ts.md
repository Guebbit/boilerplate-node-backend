---
source: src/modules/account/tests/unit/key-ring.test.ts
sha256: e9be536006d1955c829bec7f492d19c5410ae736c24ba8ddcbdf5faa8d68b9ed
generated_at: 2026-11-08T04:47:38.716884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/key-ring.test.ts

## Purpose

Unit tests for the pure key-ID functions in `key-ring.ts`. They pin down the invariants that JWT verification depends on: key IDs are deterministic, collision-free, and independent of ring position. This file deliberately tests only the ID math—signing is covered separately in `session-jwt.test.ts`.

## Key elements

- **`describe('keyId')`** — three cases:
  - *Stable*: same secret always yields the same ID.
  - *Distinct*: different secrets yield different IDs (no cross-key collision).
  - *Position-independent*: the ID is derived from the secret itself, not its index in the ring, so rotating out the oldest entry does not repoint an existing token's `kid`.
- **`describe('keyForId')`** — three cases using a two-element `ring`:
  - Resolves a `kid` to the matching ring member.
  - Returns `undefined` when the `kid` names a retired (absent) secret.
  - Returns `undefined` when passed `undefined` (a token with no `kid`), rather than defaulting to `ring[0]`.

## Relationships

- **`src/modules/account/session/key-ring.ts`** — the sole import source. The test file exercises its two exported functions, `keyId` and `keyForId`, in isolation (no mocking, no network, no signing library).

## Notes

- The file's own module doc comment explicitly scopes out signing; do not add tests for signature verification here—that belongs in `session-jwt.test.ts`.
- The "absent kid" test (`keyForId(ring, undefined)`) encodes a security requirement: an unkeyed token must be rejected, not silently attributed to the newest key. If `keyForId` gains a default-argument or fallback, this test is the guardrail.
