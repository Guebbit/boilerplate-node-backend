/**
 * @module
 * The schema of a scheduled job's DATA, as written in `shared/rules/jobs.yaml` (the kernel's
 * jobs) and in each module's `module.yaml` `jobs:` block.
 *
 * Only what the crontab and the ops table need: name, cron and summary. `run`, the lease and what
 * the job needs booted stay code (`JobDeclaration` in `@kernel/registry` is this plus that code).
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** Five whitespace-separated cron fields, each made of digits and `* / , -`. A shape check, not a parser. */
const CRON_SHAPE = /^[\d*/,-]+(\s+[\d*/,-]+){4}$/;

/** One job's data. Strict: an extra key is a typo, or a behaviour that belongs in code. */
export const jobDataSchema = z.strictObject({
    /** `reap:*` for what deletes or scrubs, `sweep:*` for what retries or drains. Unique repo-wide. */
    name: z.string().regex(/^(reap|sweep):[a-z0-9]+(-[a-z0-9]+)*$/),
    /** Five-field cron expression, in the container's time zone (UTC). */
    schedule: z.string().regex(CRON_SHAPE),
    /** What it does, in one line: the comment above its `docker/crontab` entry. */
    summary: z.string().min(1)
});

/** One job's data, once parsed. */
export type JobData = z.infer<typeof jobDataSchema>;

/** A `jobs:` block: jobs keyed by the handle the generated TypeScript exports them under. */
export const jobsBlockSchema = z.record(z.string(), jobDataSchema);

/** Shape of `shared/rules/jobs.yaml`. */
export const jobsSchema = z.strictObject({ jobs: jobsBlockSchema });
