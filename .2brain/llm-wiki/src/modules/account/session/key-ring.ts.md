---
source: src/modules/account/session/key-ring.ts
sha256: 77f71b691dc1f317f773caf9eed3eab00fc3593e23a98e88731d0c7bc4c40277
generated_at: 2026-10-14T09:00:59.380428+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/key-ring.ts

## Purpose

Pure helper module that gives each signing secret in the key ring a stable identifier (`kid`) and provides lookup by that identifier. It contains no signing logic — it only derives and matches identifiers so that `./jwt` can stamp and resolve the `kid` header without this file needing to import the signer.

## Key elements

- **`keyId(secret: string): string`** — Derives a 16-character hex identifier by taking the first 16 chars of the SHA-256 hex digest of the secret. Pure; deterministic; independent of ring position so rotation never shifts an existing token's `kid` to a different key.
- **`keyForId(ring: readonly string[], kid: string | undefined): string | undefined`** — Linear scan of the ordered ring (newest first) to find the member whose `keyId` matches `kid`. Returns `undefined` when no member matches (retired key or missing header); the caller is expected to treat that as a rejection, not a crash.

## Relationships

- **`src/modules/account/session/jwt.ts`** — Primary consumer. Calls `keyId` when signing to set the token's `kid` header, and `keyForId` during verification to select the correct ring member for the signature check.
- **`src/infrastructure/config/fields.ts`** — Supplies the configured secrets that form the ring array passed into `keyForId`.
- **`src/modules/account/tests/unit/key-ring.test.ts`** — Unit tests for `keyId` determinism and `keyForId` match/miss behavior.
- **`src/modules/account/tests/unit/session-jwt.test.ts`** — Verifies that `jwt` correctly uses these helpers end-to-end.
- **`src/modules/account/tests/integration/jwt.test.ts`** — Integration coverage exercising the ring lookup through the full sign/verify path.

## Notes

- `keyId` uses only the first 16 hex chars of a SHA-256 digest. Collisions are theoretically possible but astronomically unlikely for the intended key counts; this is an accepted trade-off for a short header value.
- `keyForId` expects the ring ordered **newest first**; the function itself is order-agnostic (it returns the first match), but the ordering convention matters for which key a `kid` resolves to if two secrets ever produced the same 16-char prefix.
- The module deliberately avoids importing `./jwt` or any signing dependency to keep the identifier math independently testable.
