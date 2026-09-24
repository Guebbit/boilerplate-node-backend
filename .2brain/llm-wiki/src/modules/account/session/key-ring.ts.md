---
source: src/modules/account/session/key-ring.ts
sha256: 63bf932607e67d46420c3f7d5258f813f7622d0b59bced114d5971d150bc7d67
generated_at: 2026-09-23T18:11:40.688166+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/key-ring.ts

## Purpose

Pure helper module that derives a stable identifier (`kid`) from a signing secret and resolves that identifier back to the matching ring member. It exists so `./jwt` can pick the correct key from a multi-key ring without importing `jsonwebtoken`, keeping the identification logic independently testable.

## Key elements

- **`keyId(secret: string): string`** — Computes a SHA-256 hash of the secret and returns the first 16 hex characters. The value is deterministic for a given secret and independent of the secret's position in the ring, so rotating (dropping) older entries never re-points an existing token's `kid` to a different key.
- **`keyForId(ring: readonly string[], kid: string | undefined): string | undefined`** — Linearly scans the ring (newest-first) and returns the member whose `keyId` matches the supplied `kid`, or `undefined` when no member matches (retired key, missing header, etc.). Callers are expected to treat `undefined` as "prompt re-login," not as a crash.

## Relationships

- **`src/modules/account/session/jwt.ts`** — The primary consumer. It calls `keyId` when building a token header and `keyForId` during verification to select the correct secret from the ring before decoding/signing.
- **`src/modules/account/tests/unit/key-ring.test.ts`** — Unit-tests both exports directly (determinism of `keyId`, lookup and miss paths of `keyForId`).
- **`src/modules/account/tests/integration/jwt.test.ts`** — Exercises the ring indirectly through full sign/verify round-trips.
- **`src/modules/account/tests/unit/session-jwt.test.ts`** — Unit-tests session-specific JWT flows that rely on ring resolution.
- **`src/modules/payments/providers/webhook-signature.ts`** — Uses `keyId` (or `keyForId`) to identify which webhook signing key a request's header names, applying the same "identify without iterating all keys" pattern.

## Notes

- The ring is **ordered newest-first**; `keyForId` relies on that order only for iteration, not for correctness (it scans until a match).
- `kid` is derived from the *secret value*, not its index. This is a deliberate invariant: appending or removing ring members must never change the `kid` of a surviving secret.
- The module imports only `node:crypto`; it performs no signing, verification, or network I/O. Keep it that way so it stays trivially unit-testable.
