---
source: src/modules/webhooks/services/reencrypt.ts
sha256: 296376cdb1dd1563716277fb2df6568ce31b298af0929a18bd5e91d2da4cfdfe
generated_at: 2026-11-08T09:07:00.378155+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/reencrypt.ts

## Purpose
Service-layer entry point that re-encrypts every webhook subscription's signing secrets onto the newest key in the encryption key ring. It exists so the ops script (defined in `@infrastructure/security/reencrypt`) can drive a bulk rotation without touching domain logic directly.

## Key elements
- **`reencryptWebhookSecrets(dryRun = false)`** (exported) — Delegates to `webhookSubscriptionRepository.reencrypt`, passing the current key ring (`getWebhookEncryptionKeyRing()`), the `fieldsOf` mapper, and the `dryRun` flag. When `dryRun` is true the repository counts affected fields without writing.
- **`fieldsOf(subscription)`** (module-local) — Maps a `WebhookSubscriptionDocument`'s `secrets` array into an `EncryptedField[]`, giving each field its MongoDB path (`secrets.<index>.ciphertext`), the stored ciphertext, a binding derived from the entry id via `ringSecretBinding`, and a static label.

## Relationships
- **`src/infrastructure/security/reencrypt.ts`** — Supplies the `EncryptedField` type contract that `fieldsOf` must satisfy; also hosts the ops script that ultimately calls this module.
- **`src/modules/webhooks/config.ts`** — Provides `getWebhookEncryptionKeyRing()`, the active key ring used for the re-encryption target.
- **`src/modules/webhooks/model.ts`** — Defines `WebhookSubscriptionDocument`, the shape `fieldsOf` reads from.
- **`src/modules/webhooks/repository.ts`** — Exposes `webhookSubscriptionRepository.reencrypt`, the data-access method that performs the actual read/transform/write.
- **`src/modules/webhooks/secrets.ts`** — Provides `ringSecretBinding(entry.id)`, which produces the per-field binding value for the encryption infrastructure.
- **`src/modules/webhooks/services/index.ts`** — Barrel that re-exports `reencryptWebhookSecrets` for consumers outside the services folder.

## Notes
- `fieldsOf` is **not** exported; it is an internal helper scoped to this module. Consumers get only `reencryptWebhookSecrets`.
- The field `path` is positional (`secrets.<index>`), not keyed by the entry's own `id`. If the `secrets` array is ever reordered or pruned, the path in the encryption metadata would no longer match the document shape.
- The `label` is a constant string (`'webhooksubscriptions.secrets.ciphertext'`); it does not vary per entry.
- The module has no side effects on import; all work is gated behind the exported call.
