#!/usr/bin/env tsx
/**
 * @module
 * The one runner for every scheduled job — `npm run <name>` (e.g. `npm run reap:orders`), which
 * `npm run jobs:generate` points at `tsx scripts/ops/run-job.ts <name>`.
 *
 * A job is declared once, on the manifest of the module that owns the work (`AppModule.jobs`) or in
 * `src/app/jobs.ts` when it belongs to none. This script looks the declaration up, connects,
 * installs what the job `needs`, runs it (under its lease, when it has one) and records the
 * outcome for `/observability/health` through `scripts/run-script.ts`.
 *
 * Meant to run from cron (`docker/crontab`, generated from the same declarations), never on boot.
 * Every job is idempotent, so a missed or overlapping run costs nothing.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { parseArgs } from 'node:util';
import { logger } from '@infrastructure/adapters/logger';
import { stopQueue } from '@infrastructure/adapters/queue';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { withLease } from '@infrastructure/persistence/lease';
import { bootI18n } from '@infrastructure/i18n';
import { registerModules, resolveJobs, type JobDeclaration } from '@kernel/registry';
import { appJobs } from '../../src/app/jobs';
import { enabledModules, enabledModuleDirectories } from '../../src/modules';
import { runScript } from '../run-script';

/** Every job this build runs: the ones no module owns, then each enabled module's. */
const allJobs = (): readonly JobDeclaration[] => [...appJobs, ...resolveJobs(enabledModules)];

/**
 * Install what the job declared it needs: every module's event subscriptions (a sweep that works
 * by emitting an event is unheard without them) and the translations (a sweep that renders mail).
 *
 * @param job - the job about to run
 */
const prepare = (job: JobDeclaration): Promise<unknown> => {
    if (job.needs?.subscriptions) registerModules(enabledModules);
    return job.needs?.i18n ? bootI18n(enabledModuleDirectories('locales')) : Promise.resolve();
};

/**
 * The work itself: under the lease when the job has one, plain otherwise.
 *
 * @param job - the job to run
 */
const work = (job: JobDeclaration): Promise<void> => {
    if (!job.lease) return job.run().then(() => undefined);
    // `true` marks "it ran": `withLease` answers `undefined` for a skipped run, and a job's own
    // result is often `undefined` too.
    return withLease(job.name, job.lease.ttlMs, () => job.run().then(() => true)).then((ran) => {
        if (ran === undefined)
            logger.info({ message: `${job.name} skipped: another holder already has the lease.` });
    });
};

/**
 * Connect (before the work, or after it for a sweep that never needs Mongo), prepare, and work.
 *
 * @param job - the job to run
 */
const execute = (job: JobDeclaration): Promise<void> =>
    job.connectFirst === false
        ? prepare(job)
              .then(() => work(job))
              .then(() => startJob())
        : startJob()
              .then(() => prepare(job))
              .then(() => work(job));

/** Resolve the job the command line names, or exit non-zero listing the ones there are. */
const requestedJob = (): JobDeclaration => {
    // Node: https://nodejs.org/api/util.html#utilparseargsconfig — positionals only, one job name.
    const { positionals } = parseArgs({ allowPositionals: true });
    const [name] = positionals;
    const found = allJobs().find((job) => job.name === name);
    if (!found) {
        console.error(
            `Unknown job ${JSON.stringify(name)}. Known: ${allJobs()
                .map((job) => job.name)
                .join(', ')}`
        );
        process.exit(1);
    }
    return found;
};

const job = requestedJob();

// Entry point: run the job, record its outcome under its name (a leased job records through its own
// lease document, since a skipped run must not read as a success), and close the connections on
// both paths. See `scripts/run-script.ts`.
void runScript(
    job.lease ? undefined : job.name,
    () => execute(job),
    () => Promise.all([stopDatabase(), stopQueue()])
);
