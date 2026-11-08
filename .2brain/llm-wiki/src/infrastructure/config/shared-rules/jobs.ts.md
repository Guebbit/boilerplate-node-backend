---
source: src/infrastructure/config/shared-rules/jobs.ts
sha256: 423ab77d0fbb4e1e321a63725a05ab1d9585d7e9bed03af95b7ffcc0d39390b6
generated_at: 2026-11-08T03:26:39.322706+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/jobs.ts

## Purpose

Defines the Zod schema for the **data** portion of a scheduled job (name, cron schedule, one-line summary) as authored in `shared/rules/jobs.yaml` and in each module's `module.yaml` `jobs:` block. It deliberately excludes the code-side concerns (what to `run`, lease details, boot requirements), which live in `JobDeclaration` in `@kernel/registry`. The schema exists so that the crontab generator and the ops table can validate YAML before any TypeScript is involved.

## Key elements

- **`CRON_SHAPE`** (private) — A regex that checks five whitespace-separated fields composed of `0-9 * / , -`. It is a shape check, **not** a cron parser.
- **`jobDataSchema`** — `z.strictObject` with three keys:
  - `name` — must match `^(reap|sweep):[a-z0-9]+(-[a-z0-9]+)*$`; `reap:*` for destructive/cleanup jobs, `sweep:*` for retry/drain jobs. Must be unique repo-wide.
  - `schedule` — five-field cron string (container TZ is UTC).
  - `summary` — non-empty string; the comment that appears above the job's `docker/crontab` entry.
- **`JobData`** — Inferred TypeScript type (`z.infer`).
- **`jobsBlockSchema`** — `z.record(z.string(), jobDataSchema)`; models the `jobs:` block keyed by the handle the generated TypeScript exports.
- **`jobsSchema`** — `z.strictObject({ jobs: jobsBlockSchema })`; the top-level shape of `shared/rules/jobs.yaml`.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Houses `JobDeclaration`, which is the superset of `JobData` plus the code-side fields (`run`, lease, boot deps). This file provides the *data* half of that split.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Consumes (or validates against) these schemas when generating TypeScript types / contract artifacts from the YAML sources.
- **`src/modules/shop-tasks/jobs.ts`** — A concrete module that exports job data conforming to `jobDataSchema` / `jobsBlockSchema`.
- **`scripts/docs/module-descriptor.ts`** — Reads the module descriptor (including the `jobs:` block) to produce documentation; these schemas define what is valid in that block.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Unit-tests the schemas exported here.

## Notes

- All schemas are **strict** (`z.strictObject`). An unexpected key in the YAML is treated as a typo or a leaked code-side concern and will fail validation.
- The cron regex is intentionally permissive (shape only). Actual cron semantics (e.g. `*/15` in the minute field) are validated elsewhere or at runtime.
- The module enforces a **relative-imports-only** convention (documented in the file header, cross-referencing `src/infrastructure/config/shared-rules/load.ts`).
- Job names are the contract: the `reap:` / `sweep:` prefix is semantic, not cosmetic, and must be unique across the entire repository.
