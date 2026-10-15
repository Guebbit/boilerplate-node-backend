---
source: src/modules/orders/domain/anonymization.ts
sha256: f181bfa622b2e0aaedaf163ca601e56c10291e55a0f243d44deb84b241c3032d
generated_at: 2026-10-15T11:00:53.554264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/anonymization.ts

## Purpose

Defines a single domain constant used as the placeholder email for orders that have been anonymized. It exists to satisfy the non-nullable `email` schema field while ensuring no real mailbox can ever receive mail on behalf of a scrubbed buyer.

## Key elements

- **`ANONYMIZED_EMAIL`** (`'anonymized@deleted.invalid'`) — The value written over an order's `email` field during anonymization. The `.invalid` TLD is reserved by RFC 6761 §6.4 and never resolves in DNS, guaranteeing that any SMTP delivery attempt bounces.

## Relationships

- **`src/modules/orders/repository.ts`** — The `scrubDueForAnonymization` operation (referenced in the module doc) persists `ANONYMIZED_EMAIL` into the order record stored by the repository.
- **`src/modules/orders/services/notify.ts`** — Because `ANONYMIZED_EMAIL` can never resolve, notification logic can safely skip or attempt delivery to it without risk of contacting the original buyer.

## Notes

- The `.invalid` TLD is a *guaranteed* bounce by DNS specification, not a best-effort heuristic. This is what makes the placeholder safe without additional suppression logic.
- The constant is the **only** export in this file; all anonymization logic lives elsewhere (e.g., the repository's `scrubDueForAnonymization`). This file is purely a shared domain constant to avoid magic-string drift.
