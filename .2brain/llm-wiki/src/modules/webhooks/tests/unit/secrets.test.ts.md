---
source: src/modules/webhooks/tests/unit/secrets.test.ts
sha256: 51d06ed54c8e50697e9c6d87e9342f6c2e62a5eef5871872c66aaa6b1b190df4
generated_at: 2026-10-29T06:33:24.479018+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/secrets.test.ts

## Purpose

Unit tests for the webhook secret-ring operations in `secrets.ts`: encryption/decryption round-trips, secret minting, the 24-hour overlap (supersession) window, retirement reporting, and entry removal. The underlying versioned-crypto and version-mismatch logic is tested once in `tests/unit/infrastructure/security/versioned-secret.test.ts`; this file exercises the ring-level wiring around it.

## Key elements

- **`describe('encryptRingSecret / decryptRingSecret')`** – Verifies round-trip under the configured key and that a ciphertext is rejected when presented to a different entry id.
- **`describe('mintRingSecret')`** – Asserts the plaintext has the `whsec_` prefix, the entry id is a v4 UUID, `createdAt` is a `Date`, and successive mints are unique.
- **`describe('activeRingSecrets')`** – Confirms all entries decrypt in ring (oldest-first) order and that an empty ring yields `[]`.
- **`mintedAt(at: Date)`** – Local helper that mints a secret then overwrites `entry.createdAt` so time-window tests can use fixed instants without real waiting.
- **`describe('the overlap window')`** – Pins the 24-hour supersession rule: a superseded secret stays active until its successor has been live for 24 h; the newest entry never expires.
- **`describe('retiringRingSecrets')`** – Returns `{ id, retiresAt }` for each superseded entry where `retiresAt` = successor's mint time + 24 h; empty for a single-entry ring or after the window closes.
- **`describe('removeRingSecret')`** – Removes the entry matching the given id; is a no-op (returns the ring unchanged) when the id is absent.

## Relationships

- **`src/modules/webhooks/secrets.ts`** – Source of every function under test (`encryptRingSecret`, `decryptRingSecret`, `mintRingSecret`, `activeRingSecrets`, `liveRingEntries`, `retiringRingSecrets`, `removeRingSecret`).
- **`src/modules/webhooks/model.ts`** – Provides the `WebhookSecretRingEntry` type used to construct ring fixtures.
- **`tests/support/setup-environment.ts`** (referenced in header comment) – Sets `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` for every suite, making the encryption key available without per-test setup.
- **`tests/unit/infrastructure/security/versioned-secret.test.ts`** (referenced in header comment) – Owns the crypto/version-mismatch tests; this file deliberately does not duplicate them.

## Notes

- The 24-hour overlap window is the central behavioural contract: a secret remains "active" for exactly 24 h after its successor is minted. The `retiringRingSecrets` return value's `retiresAt` is computed as *successor's* `createdAt` + 24 h, not the retiring secret's own timestamp.
- The newest entry in a ring is exempt from expiry regardless of age — verified explicitly with a 1000-hour-old single entry.
- All time-sensitive tests use the `mintedAt` helper with a fixed `t0` of `2026-10-06T00:00:00Z`; no test relies on `Date.now()`.
