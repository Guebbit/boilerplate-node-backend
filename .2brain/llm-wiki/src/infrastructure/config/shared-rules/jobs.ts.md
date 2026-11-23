---
source: src/infrastructure/config/shared-rules/jobs.ts
source_sha256: 82db17b78756b65b8cd266792a2d6cc7dcb0648752655525e9a55816498c4e63
context_sha256: 60705f71328316cbbbb639a411a56a6d5c7cc8421ca546960bec5b62aad70819
generated_at: 2026-11-22T02:45:21.201764+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/jobs.ts

## Purpose
Defines the Zod schema for a scheduled job's *data*, as written in `shared/rules/jobs.yaml` (kernel jobs) and in each module's `module.yaml` `jobs:` block. It covers only what the crontab and ops table need: name, schedule and summary. Behavior (`run`, the lease, what the job needs booted) stays in code; `JobDeclaration` in `@kernel/registry` combines this data with that code.

## Key elements
- `CRON_SHAPE` (private): regex that checks five whitespace-separated fields made of digits and `* / , -`. It is a shape check, not a cron parser.
- `jobDataSchema` (private): a strict object with three fields:
  - `name`: must match `reap:*` or `sweep:*` in kebab-case (`reap` for what deletes or scrubs, `sweep` for what retries or drains). Unique repo-wide.
  - `schedule`: five-field cron expression, in the container's time zone (UTC).
  - `summary`: non-empty one-liner, used as the comment above the job's `docker/crontab` entry.
- `JobData`: type inferred from `jobDataSchema`.
- `jobsBlockSchema`: `z.record(z.string(), jobDataSchema)`. A `jobs:` block, keyed by the handle the generated TypeScript exports each job under.
- `jobsSchema`: strict object `{ jobs: jobsBlockSchema }`, the shape of `shared/rules/jobs.yaml`.

## Relationships
- `registry.ts` (same folder) is the shared-rules registry that these schemas plug into.
- `scripts/contracts/generate-shared-rule-schemas.ts` generates schemas for the shared rules.
- `scripts/docs/module-descriptor.ts` and `src/modules/shop-tasks/jobs.ts` are graph neighbors, plausibly consumers of the job data or the `jobs:` block shape.
- `tests/unit/infrastructure/config/ops-rules-schemas.test.ts` is the unit test for the ops rule schemas.

## Notes
- Both object schemas are strict: an unknown key is rejected, as it is either a typo or behavior that belongs in code.
- Uniqueness of `name` is not enforced by this schema. It is only documented as unique repo-wide.
- Imports must be relative only (see `load.ts` in the same folder).
