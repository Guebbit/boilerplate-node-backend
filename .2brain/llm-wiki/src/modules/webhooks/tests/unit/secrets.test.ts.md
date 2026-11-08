---
source: src/modules/webhooks/tests/unit/secrets.test.ts
sha256: 51d06ed54c8e50697e9c6d87e9342f6c2e62a5eef5871872c66aaa6b1b190df4
generated_at: 2026-11-08T09:10:38.911998+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/secrets.test.ts

## Purpose

Unit tests for the secret-ring operations exported by `secrets.ts` — encryption/decryption of individual entries, minting new secrets, resolving the active signing set under the 24-hour overlap window, listing secrets that are retiring, and removing an entry by id. The file deliberately does **not** re-test the underlying crypto or version-mismatch logic; that belongs to `versioned-secret.test.ts`. Here it verifies the ring-level wiring and timing semantics.

## Key elements

- **`encryptRingSecret` / `decryptRound-trip tests`** — Confirms a plaintext round-trips under its own entry id and that decrypting under a *different* entry id throws.
- **`mintRingSecret` tests** — Verifies the returned plaintext starts with `whsec_`, the entry id is a valid UUID v4, `createdAt` is a `Date`, the entry decrypts back to the plaintext, and successive mints produce distinct values.
- **`activeRingSecrets` tests** — Checks that all entries in the ring are returned oldest-first, that an empty ring yields `[]`, and that the 24-hour overlap window correctly includes/excludes a superseded secret relative to its successor's mint time.
- **`liveRingEntries` tests** — Confirms only entries still within the signing window are returned; the newest entry never expires.
- **`retiringRingSecrets` tests** — Asserts that a superseded entry is listed with `retiresAt` equal to the successor's `createdAt` + 24 h, and that the list is empty for a single-entry ring or once the window has elapsed.
- **`removeRingSecret` tests** — Verifies exact-id removal and no-op behaviour for an unknown id.
- **`mintedAt` (local helper)** — Calls `mintRingSecret()` then overwrites `entry.createdAt` with a supplied `Date`, enabling deterministic expiry tests without real waiting.

## Relationships

- **`src/modules/webhooks/secrets.ts`** — The module under test. All seven functions (`encryptRingSecret`, `decryptRingSecret`, `mintRingSecret`, `activeRingSecrets`, `liveRingEntries`, `removeRingSecret`, `retiringRingSecrets`) are imported and exercised here.
- **`src/modules/webhooks/model.ts`** — Provides the `WebhookSecretRingEntry` type, used to build ring arrays in fixtures and as the expected element type in `activeRingSecrets` / `liveRingEntries` assertions.

## Notes

- `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` is set globally by `tests/support/setup-environment.ts`; this file does not set it.
- The 24-hour overlap window is a default in `secrets.ts`; tests use a fixed `t0` (`2026-10-06T00:00:00Z`) and arithmetic offsets to hit the boundary (24 h vs 25 h) without sleeping.
- The crypto primitives (AES-GCM / version tagging) are intentionally out of scope; see `tests/unit/infrastructure/security/versioned-secret.test.ts` for that layer.
