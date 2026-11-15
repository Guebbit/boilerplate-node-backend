---
source: src/infrastructure/config/shared-rules/jobs.ts
sha256: 82db17b78756b65b8cd266792a2d6cc7dcb0648752655525e9a55816498c4e63
generated_at: 2026-11-14T17:57:41.213655+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/jobs.ts

## Purpose

Defines the Zod schema for the **data** portion of a scheduled job entry as it appears in `shared/rules/jobs.yaml` (kernel jobs) and in each module's `module.yaml` `jobs:` block. It intentionally captures only what the crontab and the ops table need (name, schedule, summary); the executable code side lives separately as `JobDeclaration` in `@kernel/registry`.

## Key elements

- **`CRON_SHAPE`** (internal) – Regex that shape-checks a five-field cron expression (digits, `* / , -`). Does not parse or validate semantics.
- **`jobDataSchema`** (internal) – `z.strictObject` with three fields:
  - `name` – must match `^(reap|sweep):[a-z0-9]+(-[a-z0-9]+)*$`
  - `schedule` – five-field cron, UTC
  - `summary` – non-empty string
- **`JobData`** (exported type) – `z.infer` of `jobDataSchema`.
- **`jobsBlockSchema`** (exported const) – `z.record(z.string(), jobDataSchema)`; the `jobs:` block keyed by export handle.
- **`jobsSchema`** (exported const) – `z.strictObject({ jobs: jobsBlockSchema })`; the full shape of `shared/rules/jobs.yaml`.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** – The doc comment references `JobDeclaration` in `@kernel/registry` as the superset of this schema (data + code: `run`, lease, boot requirements).
- **`scripts/contracts/generate-shared-rule-schemas.ts`** – Consumes or validates these schemas as part of contract generation.
- **`scripts/docs/module-descriptor.ts`** – Documents module descriptors; the `jobs:` block described here is part of what a module descriptor contains.
- **`src/modules/shop-tasks/jobs.ts`** – A module-level jobs file whose data entries conform to the same `jobDataSchema` shape defined here.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** – Unit tests exercising these schemas (shape, strictness, cron regex, name regex).

## Notes

- All objects are **strict**: an unexpected key is a hard failure, treated as either a typo or a concern that belongs in code rather than config.
- Cron validation is **shape-only** (five whitespace-separated fields of allowed characters); it will not catch semantically invalid expressions (e.g., `99 * * * *`).
- Job names are namespaced by verb prefix: `reap:*` for delete/scrub jobs, `sweep:*` for retry/drain jobs. Names must be unique repo-wide.
- The file enforces **relative imports only** (per the header comment and the convention in `load.ts` in the same directory).
