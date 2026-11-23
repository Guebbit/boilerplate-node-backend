---
source: src/infrastructure/config/shared-rules/outbox.ts
source_sha256: 875539c8bb1db2ecc641543bba97109617ead37b977ad3262215a4fe55358a53
context_sha256: f618544957dfde5821e1c9b775cfb10e9fb92d5294521a3fb3c5e28ce31b1ede
generated_at: 2026-11-22T02:45:56.025669+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/outbox.ts

## Purpose
Defines the Zod schema for `shared/rules/outbox.yaml`, which holds the default retry-policy settings for the transactional outbox. It validates the shape and types of that YAML file when it is loaded.

## Key elements
- `outboxSchema` (export): a `z.strictObject` with a single top-level `outbox` strict object. Unknown keys are rejected at both levels. The `outbox` object has these fields, each a positive integer:
  - `retentionDays`: days a published row is kept before the sweep deletes it.
  - `maxAttempts`: failed dispatches before a row is parked as `dead`.
  - `leaseSeconds`: seconds a relay's claim on a row lasts.
  - `backoffBaseMs`: backoff after the first failure, in milliseconds. It doubles each time.
  - `backoffCapMs`: upper limit on the backoff, in milliseconds.
- `positive` (module-private): shared `z.int().positive()` helper used for every field.

## Relationships
- `registry.ts` is a neighbor in the same `shared-rules` directory. It is presumably where this schema is registered, but that wiring is not visible in this file.
- `tests/unit/infrastructure/config/ops-rules-schemas.test.ts` covers this schema as part of the ops-rules schema tests.

## Notes
- The module doc says to use relative imports only, as explained in `load.ts` in the same directory.
- The schema checks only that each value is a positive integer. It does not check that `backoffCapMs` is at least `backoffBaseMs`.
