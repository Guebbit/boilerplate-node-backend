---
source: src/modules/orders/domain/anonymization.ts
source_sha256: f181bfa622b2e0aaedaf163ca601e56c10291e55a0f243d44deb84b241c3032d
context_sha256: 0c5e933494d8a64aeaaaf367dc727d90f9550f57397347249a51cd891d29f080
generated_at: 2026-11-22T06:10:31.299333+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/anonymization.ts

## Purpose
Defines the placeholder email that an anonymised order carries in place of the buyer's real email. The order schema requires an `email` value, so anonymisation overwrites it with this fixed constant rather than leaving it empty.

## Key elements
- `ANONYMIZED_EMAIL` — constant `'anonymized@deleted.invalid'`. It is the value that `scrubDueForAnonymization` writes over `email`. The file only documents that function; it is not defined here.

## Relationships
No imports or usage are visible in this file. The neighbors (`src/modules/orders/domain/billing.ts`, `src/modules/orders/repository.ts`, `src/modules/orders/services/notify.ts`, and the billing-address and notify tests) are related through the dependency graph, but this file does not show how they use the constant.

## Notes
- The `.invalid` TLD never resolves (RFC 6761 section 6.4), so any mail sent to this address is a guaranteed bounce. The doc comment says buyer mails skip it.
- Compare against this constant to recognise an anonymised order. Do not treat the address as a real recipient.
