---
source: src/modules/tasks/tests/unit/schema-contract.test.ts
sha256: dadbe8204f4e7ad5f49b25de3adab177b3b9ed82bdc197cf888bafee20736fb4
generated_at: 2026-11-14T22:18:10.477145+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins the publicly observable shape of `taskSchema`: which fields are required vs. optional, which defaults exist, the status enum, and the full set of MongoDB index specifications (including partial filters, uniqueness, and TTL expiry). It exists so that any change to the schema's public contract—fields, defaults, indexes—fails loudly in CI before reaching production.

## Key elements

- **`RETENTION_SECONDS`** — Derived from `currentEnvironment().NODE_TASKS_RETENTION_DAYS` (default 730 days) converted to seconds. Used to assert TTL values without hardcoding a magic number.
- **`describe('taskSchema', …)`** — Single test suite containing eight assertions grouped by concern:
  - Required paths are exactly `['message', 'routeSet', 'subject']`; `name` is explicitly *not* required.
  - `respondedAt` and `closedAt` carry no `default` (operator-filled, not submission-filled).
  - `status` defaults to `TaskStatus.new` and is constrained to the full `TaskStatus` enum.
  - `timestamps` option is `true`.
  - Full index list (9 compound/single-field indexes) is asserted verbatim.
  - Full index-option list (partial filters, uniqueness on `openKey`, TTL on `closedAt` and `createdAt`) is asserted verbatim.
  - `closedAt_1` is confirmed as a single-field **ascending** index (the only shape Mongo will apply `expireAfterSeconds` to).

## Relationships

- **`src/modules/tasks/model.ts`** — Source of `taskSchema`, the value under test.
- **`src/types/index.ts`** — Provides `TaskStatus`, used to validate the status enum and its default.
- **`src/infrastructure/config/store.ts`** — Provides `currentEnvironment()`, which supplies `NODE_TASKS_RETENTION_DAYS` for the TTL assertion.
- **`tests/support/schema.ts`** — Supplies the introspection helpers (`requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`) that extract schema metadata without instantiating a Mongoose connection.

## Notes

- The file's module docblock describes a "contact form" and references `email` as a required field; however, the actual assertions show `email` is **not** in `requiredPaths`. The comment explains this is a service-level requirement for visitor tasks only, not a schema-level one. The docblock language is a historical artifact—read the assertions, not the prose.
- TTL correctness depends on `closedAt_1` being a dedicated single-field ascending index. A compound or descending index on `closedAt` would silently disable document expiry in MongoDB. The last test guards against that regression.
- The TTL assertion compares against `RETENTION_SECONDS` (config-derived) rather than a literal, so changing `NODE_TASKS_RETENTION_DAYS` moves both the policy and the expected value in lockstep.
