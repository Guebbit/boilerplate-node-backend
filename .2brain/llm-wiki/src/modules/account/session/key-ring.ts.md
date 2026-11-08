---
source: src/modules/account/session/key-ring.ts
sha256: 77f71b691dc1f317f773caf9eed3eab00fc3593e23a98e88731d0c7bc4c40277
generated_at: 2026-11-08T04:29:09.588409+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/key-ring.ts

## Purpose

Pure utility module that maps secrets to stable identifiers (`kid`) and resolves a `kid` back to its ring member. It exists so `./jwt` can locate the correct signing key from a token's header without importing any crypto signing logic, keeping the "ring math" independently testable.

## Key elements

- **`keyId(secret: string): string`** — Derives a 16-character hex identifier from a secret (first 16 hex chars of its SHA-256 digest). The identifier is content-derived, not position-derived, so ring rotation (dropping oldest entries) never silently remaps an existing `kid`.
- **`keyForId(ring: readonly string[], kid: string | undefined): string | undefined`** — Returns the ring member whose `keyId` matches `kid`, or `undefined` if no member matches (retired key, missing header, etc.). Caller is responsible for turning `undefined` into a rejection.

## Relationships

- **`src/modules/account/session/jwt.ts`** — Primary consumer. Calls `keyId` when issuing tokens (to stamp the header) and `keyForId` when verifying (to pick the right secret before verifying the signature).
- **`src/infrastructure/config/fields.ts`** — Supplies the ordered ring (array of secrets, newest first) that `keyForId` searches.
- **`src/modules/account/tests/unit/key-ring.test.ts`** — Unit tests for both exports in isolation (no signing involved).
- **`src/modules/account/tests/unit/session-jwt.test.ts`** / **`src/modules/account/tests/integration/session-modes.test.ts`** / **`src/modules/account/tests/integration/jwt.test.ts`** — Exercise `keyId` / `keyForId` indirectly through the JWT sign/verify flow.

## Notes

- The module is intentionally **pure**: it performs hash computation and array lookup only. No `sign`, `verify`, or `JWS` calls live here.
- `keyForId` returns `undefined` rather than throwing; the contract is that the *caller* (jwt.ts) decides how to handle a missing key (e.g., "log in again").
- `kid` is 16 hex chars (64 bits of a 256-bit SHA-256). Collisions between distinct secrets in the same ring are assumed negligible for the deployment scale.
- Ring order is newest-first (per the JSDoc), but `keyForId` is an equality scan, so order does not affect correctness—only the configuration convention.
