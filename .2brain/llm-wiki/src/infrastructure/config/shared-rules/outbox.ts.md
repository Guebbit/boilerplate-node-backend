---
source: src/infrastructure/config/shared-rules/outbox.ts
sha256: 875539c8bb1db2ecc641543bba97109617ead37b977ad3262215a4fe55358a53
generated_at: 2026-10-29T01:59:58.986397+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/outbox.ts

## Purpose

Defines the Zod validation schema for `shared/rules/outbox.yaml`, which holds the default retry-policy parameters for the transactional outbox (retention, attempt limits, lease duration, and backoff bounds).

## Key elements

- **`positive`** (local, unexported) — shorthand for `z.int().positive()`, reused as the type for every numeric field.
- **`outboxSchema`** (exported) — a `z.strictObject` requiring a single top-level key `outbox`, itself a `z.strictObject` with five fields:
  - `retentionDays` — days a published row is retained before sweep-deletion.
  - `maxAttempts` — failed dispatches before a row is parked as `dead`.
  - `leaseSeconds` — duration of a relay's claim on a row.
  - `backoffBaseMs` — initial backoff (ms); doubles per retry.
  - `backoffCapMs` — upper bound on backoff (ms).

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — the registry that loads/registers shared rule schemas; it is the consumer that pulls in `outboxSchema` (alongside other rule schemas) to validate the YAML at config-load time.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — unit tests that exercise the schema shape (valid/invalid payloads) for ops rule files, including the outbox schema.

## Notes

- Both the outer and inner objects use `z.strictObject`, so **any unexpected key in the YAML causes a validation failure**. Add new fields to the schema before adding them to the YAML.
- The module docstring references `load.ts` for the "relative imports only" convention; `outboxSchema` is expected to be imported via that loader, not pulled in directly by application code.
