---
source: src/infrastructure/config/shared-rules/jobs.ts
sha256: c9e96c4c889dab7359b17f674da39d4d939646531b665db69374fc5da350646e
generated_at: 2026-10-29T01:59:17.429700+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/jobs.ts

## Purpose

Defines the Zod schemas for the **data** half of a scheduled job declaration — the fields that appear in `shared/rules/jobs.yaml` (kernel jobs) and in each module's `module.yaml` `jobs:` block. It deliberately excludes code-side concerns (`run`, lease, boot dependencies), which live in `JobDeclaration` in `@kernel/registry`.

## Key elements

- **`CRON_SHAPE`** (internal) — Regex for a five-field cron expression; a shape check, not a full parser.
- **`jobDataSchema`** — `z.strictObject` with three fields:
  - `name` — must match `^(reap|sweep):[a-z0-9]+(-[a-z0-9]+)*$` (reap = deletes/scrubs, sweep = retries/drains).
  - `schedule` — five-field cron string (UTC).
  - `summary` — non-empty one-liner.
- **`JobData`** — `z.infer` of the above.
- **`camelCaseOf`** (internal) — Converts `reap:inactive-accounts` → `reapInactiveAccounts`.
- **`jobsBlockSchema`** — `z.record(z.string(), jobDataSchema)` with a `.refine` that every key equals the camelCase of its own `name`.
- **`jobsSchema`** — Top-level `z.strictObject({ jobs: jobsBlockSchema })`; the full shape of `shared/rules/jobs.yaml`.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Defines `JobDeclaration`, which extends this file's `JobData` with code-side fields (`run`, lease, boot requirements). This file is the data subset that registry composes with.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Consumes `jobsSchema` (and sibling schemas) to emit contract/schema artifacts.
- **`scripts/docs/module-descriptor.ts`** — References the `jobs:` block shape when documenting or validating module descriptors.
- **`src/modules/notifications/jobs.ts`** — A module whose `module.yaml` `jobs:` block must conform to `jobsBlockSchema`; this file is the validation contract it satisfies.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Unit-tests the schemas defined here (valid/invalid fixtures for `jobDataSchema`, `jobsBlockSchema`, `jobsSchema`).

## Notes

- **Relative imports only** — per the convention stated in the module doc and `load.ts`; do not add bare or `@`-aliased imports here.
- **Strict objects** — `jobDataSchema` and `jobsSchema` use `z.strictObject`, so any extra YAML key is a validation error by design (typos or code-side leakage).
- **Key invariant** — The `.refine` on `jobsBlockSchema` is the only thing enforcing that a record's key matches `camelCaseOf(job.name)`. If you add a job whose key doesn't follow that rule, the error message is the only hint.
- **Cron is shape-checked, not parsed** — `CRON_SHAPE` accepts things like `**/**` as a *shape*; actual cron semantics are the scheduler's problem.
