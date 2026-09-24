---
source: src/modules/account/tests/unit/key-ring.test.ts
sha256: e9be536006d1955c829bec7f492d19c5410ae736c24ba8ddcbdf5faa8d68b9ed
generated_at: 2026-09-23T18:15:39.158623+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/key-ring.test.ts

## Purpose

Unit tests for the pure key-identification math in `key-ring.ts`. Covers the two exported helpers (`keyId` and `keyForId`) that `jwt.ts` relies on to map a token's `kid` claim to the correct secret, ensuring no accidental key collisions, no positional dependence, and no silent fallback to the newest key.

## Key elements

- **`describe('keyId')`** — Three specs:
    - Determinism: same secret always yields the same id.
    - Uniqueness: distinct secrets yield distinct ids (prevents cross-key verification).
    - Position-independence: id is a pure function of the secret value, so rotating the ring (dropping an entry) does not shift any existing token's `kid`.
- **`describe('keyForId')`** — Three specs:
    - Lookup: given a ring and a valid `kid`, returns the matching secret.
    - Retired key: a `kid` naming a key no longer in the ring returns `undefined` (caller rejects, never crashes).
    - Absent `kid`: `keyForId(ring, undefined)` returns `undefined` rather than defaulting to `ring[0]`, preventing an unkeyed forgery from being treated as signed by the newest key.

## Relationships

- **`src/modules/account/session/key-ring.ts`** — The module under test. This file imports `keyId` and `keyForId` from it and exercises their contracts in isolation. No other module is touched; the file explicitly notes that signing is out of scope (that belongs to `session-jwt.test.ts`).

## Notes

- The header comment states this file tests _pure_ math only—no JWT signing, no I/O. If you need to verify the signing round-trip, look at `session-jwt.test.ts` instead.
- The "position-independence" spec encodes a design requirement: `keyId` must be derived from the secret's _value_, not its index in the ring. A positional scheme would silently repoint `kid`s after rotation; the test guards against that regression.
- The `undefined`-kid spec is a security invariant: a token with no `kid` must never be mapped to the newest key by default.
