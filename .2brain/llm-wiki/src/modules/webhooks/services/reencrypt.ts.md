---
source: src/modules/webhooks/services/reencrypt.ts
sha256: 296376cdb1dd1563716277fb2df6568ce31b298af0929a18bd5e91d2da4cfdfe
generated_at: 2026-10-15T12:22:07.625466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/reencrypt.ts

## Purpose

Adapts the generic ring-key re-encryption infrastructure to the webhook subscriptions domain. It maps each subscription's per-entry signing secrets into the `EncryptedField` shape the infrastructure expects, then delegates the bulk re-encryption (or dry-run count) to the repository. This lets the ops script `reencrypt` rotate webhook secrets onto the newest `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` without duplicating domain logic in the infrastructure layer.

## Key elements

- **`fieldsOf`** (module-private) — Transforms a `WebhookSubscriptionDocument` into an `EncryptedField[]`. Each entry gets a path of `secrets.<index>.ciphertext`, the raw ciphertext, a binding derived from the entry's own id (via `ringSecretBinding`), and a fixed label `webhooksubscriptions.secrets.ciphertext`.
- **`reencryptWebhookSecrets(dryRun?)`** (exported) — Calls `webhookSubscriptionRepository.reencrypt` with the current key ring (from `getWebhookEncryptionKeyRing`) and the `fieldsOf` mapper. When `dryRun` is `true` the repository counts affected documents without writing; otherwise it re-encrypts in place.

## Relationships

- **`src/infrastructure/security/reencrypt.ts`** — Provides the `EncryptedField` type and the generic `reencrypt` algorithm that the repository method delegates to. This file only *consumes* the type here.
- **`src/modules/webhooks/config.ts`** — `getWebhookEncryptionKeyRing()` supplies the ordered key ring (oldest → newest) that determines which key secrets are migrated to.
- **`src/modules/webhooks/model.ts`** — `WebhookSubscriptionDocument` is the document shape that `fieldsOf` reads (specifically its `secrets` array of `{ id, ciphertext }` entries).
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository.reencrypt(...)` is the actual write (or count) path; this service file only prepares its arguments.
- **`src/modules/webhooks/secrets.ts`** — `ringSecretBinding(entryId)` produces the binding token the infrastructure uses to verify a ciphertext was encrypted with the expected key before overwriting it.
- **`src/modules/webhooks/services/index.ts`** — Re-exports `reencryptWebhookSecrets` so the module barrel (`module.ts`) and external callers can import it from a single entry point.

## Notes

- `fieldsOf` is intentionally not exported; it is an adapter callback passed into the repository and is never called directly outside this file.
- The path strings (`secrets.0.ciphertext`, `secrets.1.ciphertext`, …) use the array *index*, not the entry id. The binding still ties correctness to the entry id, so reordering the array between re-encrypt runs is safe as long as the binding matches.
- `dryRun` defaults to `false`; the ops script in `@infrastructure/security/reencrypt` is expected to pass `true` first for a safety count before a real run.
