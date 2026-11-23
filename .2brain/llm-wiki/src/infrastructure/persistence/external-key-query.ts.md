---
source: src/infrastructure/persistence/external-key-query.ts
source_sha256: 6704500e914e5864f3d6bf22c75b9e5134a5428bea70059cfad28df0f7bf343a
context_sha256: d9bf7ee6bc257586982b0a30b38b1a65c87dd353185cd39fa625b46690740316
generated_at: 2026-11-22T03:02:16.905418+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/external-key-query.ts

## Purpose
Exports a single Mongoose query option that turns on `sanitizeFilter` for lookups keyed by a value supplied by an outsider (a provider reference, an email, or a federated identity). It acts as a second line of defense against NoSQL operator injection; Zod validation at the edge remains the main guard.

## Key elements
- `EXTERNAL_KEY_QUERY` — `{ sanitizeFilter: true } as const`. When passed as a query option, any nested object in the filter whose key starts with `$` is wrapped in `$eq`. A payload like `{ "$ne": null }` standing where a string belongs then matches nothing instead of everything.

## Relationships
- `src/modules/payments/repository.ts` and `src/modules/users/repository.ts` are the graph neighbors. They are the expected consumers: lookups by provider reference, email or federated identity. The file itself contains no imports or references to them, so this is inferred from its documented purpose.

## Notes
- The option is applied per query, not globally.
- A filter that legitimately carries its own `$` operators must wrap them with `trusted()` from mongoose. Otherwise they are neutralized too and stop working.
- Zod validation at the edge is still the primary defense. This option is a backstop.
