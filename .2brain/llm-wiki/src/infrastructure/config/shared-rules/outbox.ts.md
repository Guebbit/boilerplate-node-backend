---
source: src/infrastructure/config/shared-rules/outbox.ts
sha256: 875539c8bb1db2ecc641543bba97109617ead37b977ad3262215a4fe55358a53
generated_at: 2026-11-08T03:27:15.272891+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/outbox.ts

## Purpose

Declares the Zod schema that validates `shared/rules/outbox.yaml`, the configuration file holding the transactional outbox's retry-policy defaults (retention, attempt limits, lease duration, and exponential backoff bounds). It exists so the YAML is type-checked at load time rather than failing at runtime with opaque errors.

## Key elements

- **`positive`** (module-private) — A reusable `z.int().positive()` constraint applied to every numeric field.
- **`outboxSchema`** (exported) — A `z.strictObject` describing the top-level `{ outbox: { … } }` shape. Fields:
  - `retentionDays` — days a published row survives before the sweep deletes it.
  - `maxAttempts` — failed dispatches before a row is parked as `dead`.
  - `leaseSeconds` — duration of a relay's claim on a row.
  - `backoffBaseMs` — initial backoff after first failure; doubles on each subsequent retry.
  - `backoffCapMs` — upper bound on the computed backoff.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Imports `outboxSchema` and registers it alongside the other shared-rule schemas so a single loader can validate every `shared/rules/*.yaml` file.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Exercises `outboxSchema` with valid and invalid payloads to lock in the contract.

## Notes

- The schema is **strict** at both levels: unknown keys in the YAML are rejected, not silently ignored.
- Only relative imports are permitted in this directory (per the module docblock referencing `load.ts`); no barrel or absolute paths should be introduced.
