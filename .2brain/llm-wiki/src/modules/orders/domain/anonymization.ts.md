---
source: src/modules/orders/domain/anonymization.ts
sha256: f181bfa622b2e0aaedaf163ca601e56c10291e55a0f243d44deb84b241c3032d
generated_at: 2026-11-08T06:47:53.895004+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/anonymization.ts

## Purpose

Defines the single placeholder email value written into an order's `email` field when the order is anonymized. Exists as a shared constant so every consumer (repository writes, notification checks, tests) references the same string without hard-coding it.

## Key elements

- **`ANONYMIZED_EMAIL`** (`export const`, type `string`) — The literal `'anonymized@deleted.invalid'`. The module's sole export. Chosen from the `.invalid` TLD (RFC 6761 §6.4) so it can never resolve to a real address; any mail sent to it will bounce, guaranteeing that post-anonymization buyer notifications are harmless.

## Relationships

- **`src/modules/orders/repository.ts`** — The function `scrubDueForAnonymization` (referenced in this file's doc comment) writes `ANONYMIZED_EMAIL` over the order's `email` column; the repository is the persistence layer that stores the result.
- **`src/modules/orders/services/notify.ts`** — The notification service is expected to skip sending when `email === ANONYMIZED_EMAIL` (the "buyer mails skip it" contract noted in the constant's doc comment).
- **`src/modules/orders/tests/unit/notify.test.ts`** — Unit tests that assert the skip behavior against this exact constant.

## Notes

- The file is intentionally minimal (one constant). All logic lives in the consumers. Do not add helper functions here; keep the domain value in one place.
- The `.invalid` TLD is not "fake" — it is reserved by RFC 6761 and is guaranteed never to be delegated, making it more robust than `example.com` for this purpose.
