---
source: src/modules/webhooks/tests/unit/secrets.test.ts
sha256: 20e29109ce5f16c91d14bad91b1a674579b717eb630c562cdd210fbf4c0e0149
generated_at: 2026-10-15T12:25:16.083941+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/secrets.test.ts

## Purpose

Unit tests for the webhook secret-ring layer: encrypt/decrypt, minting, active-secret selection with the 24-hour overlap window, and removal. It verifies the ring-level wiring on top of the underlying versioned-secret crypto (which is covered separately in `tests/unit/infrastructure/security/versioned-secret.test.ts`).

## Key elements

- **`describe('encryptRingSecret / decryptRingSecret')`** — round-trip under the configured key, and rejection when a ciphertext is presented against a different ring-entry ID.
- **`describe('mintRingSecret')`** — asserts the returned plaintext starts with `whsec_`, the entry ID is a valid v4 UUID, and consecutive mints produce distinct secrets and IDs.
- **`describe('activeRingSecrets')`** — order preservation (oldest-first) and empty-ring edge case.
- **`mintedAt(at: Date)`** — local helper that mints a secret and stamps `createdAt` to a chosen instant so expiry tests don't need real-time waits.
- **`describe('the overlap window')`** — with a fixed `t0` baseline: superseded secrets remain active for 24 h after their successor, drop out after that, and the newest secret never expires regardless of age.
- **`describe('removeRingSecret')`** — removes the entry matching the given ID; no-op for an unknown ID.

## Relationships

- **`src/modules/webhooks/secrets.ts`** — the module under test; all six exported functions are imported and exercised here.
- **`src/modules/webhooks/model.ts`** — provides the `WebhookSecretRingEntry` type used to construct ring arrays in test fixtures.
- **`tests/support/setup-environment.ts`** (referenced in the file header, not imported here) — sets `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` for every suite, which these tests rely on implicitly.
- **`tests/unit/infrastructure/security/versioned-secret.test.ts`** — owns the low-level crypto and version-mismatch assertions; this file deliberately avoids duplicating them.

## Notes

- The env key `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` must be present for the suite to pass; it is injected globally by the test setup file rather than set locally.
- The overlap-window tests use a hard-coded 24-hour constant (`24 * hour`). If the production default changes, these assertions will need updating in tandem.
- The helper `mintedAt` spreads the mint result and overrides `createdAt`; it is not exported and is scoped to the overlap-window `describe` block.
