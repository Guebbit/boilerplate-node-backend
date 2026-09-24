---
source: src/modules/webhooks/tests/unit/secrets.test.ts
sha256: 7fc0348616bc6d60446cdaca10f347183d089499a6177eeb858130e7e6174fdd
generated_at: 2026-09-23T19:45:19.993454+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/secrets.test.ts

## Purpose

Unit tests for the secret-ring operations (`encryptRingSecret`, `decryptRingSecret`, `mintRingSecret`, `activeRingSecrets`, `removeRingSecret`) exposed by the webhooks secrets module. It verifies wiring and ring semantics (ordering, uniqueness, removal) without re-testing the underlying crypto, which lives in `versioned-secret.ts`.

## Key elements

- **`encryptRingSecret` / `decryptRingSecret`** — tested as a round-trip pair; confirms a `whsec_*` plaintext survives encryption under the configured key and back.
- **`mintRingSecret`** — tested for Standard-Webhooks plaintext prefix (`whsec_`), UUID v4 shape on `entry.id`, `createdAt` being a `Date`, ciphertext decrypting back to the plaintext, and uniqueness across consecutive calls.
- **`activeRingSecrets`** — tested for oldest-first ordering of decrypted entries and the empty-ring case.
- **`removeRingSecret`** — tested for removing exactly one entry by id and being a no-op when the id is absent.
- **`WebhookSecretRingEntry`** (type import from `@modules/webhooks/model`) — the shape passed into and returned by the ring functions.

## Relationships

- **`src/modules/webhooks/secrets.ts`** — the module under test; all five exported functions are imported here and exercised.
- **`src/modules/webhooks/model.ts`** — source of the `WebhookSecretRingEntry` type used to construct ring arrays in the tests.

## Notes

- The encryption key (`NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`) is injected globally by `tests/support/setup.ts`; this file does not set it.
- The file explicitly delegates crypto correctness and version-mismatch behaviour to `tests/unit/infrastructure/security/versioned-secret.test.ts`; only the webhook-specific wiring is asserted here.
- `mintRingSecret` returns `{ entry, plaintext }` where `entry.ciphertext` is the stored encrypted form — tests treat the ring as an array of these entries rather than raw ciphertexts.
