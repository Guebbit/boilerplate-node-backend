#!/usr/bin/env tsx
/**
 * @module
 * The one runner for every scheduled job — `npm run job <name>` (e.g. `npm run job reap:orders`).
 * With no name it exits non-zero, listing the jobs there are.
 *
 * A job is declared once, on the manifest of the module that owns the work (`AppModule.jobs`) or in
 * `src/app/jobs.ts` when it belongs to none. This script looks the declaration up, connects,
 * boots like the app, runs it (under its lease, when it has one) and records the
 * outcome for `/observability/health` through `scripts/run-script.ts`.
 *
 * Meant to run from cron (`docker/crontab`, generated from the same declarations), never on boot.
 * Every job is idempotent, so a missed or overlapping run costs nothing.
 *
 * @see docs/reference/ops.md#scheduled-jobs
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { parseArgs } from 'node:util';
import { boundQueueRetries, stopQueue } from '@infrastructure/adapters/queue';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { resolveJobs, type JobDeclaration } from '@kernel/registry';
import { appJobs } from '../../src/app/jobs';
import { enabledModules } from '../../src/modules';
import { prepareJob, runJobWork } from './prepare-job';
import { runScript } from '../run-script';

/** Every job this build runs: the ones no module owns, then each enabled module's. */
const allJobs = (): readonly JobDeclaration[] => [...appJobs, ...resolveJobs(enabledModules)];

/**
 * Connect (before the work, or after it for a sweep that never needs Mongo), boot like the app
 * (a job with no Mongo has nothing to boot: it renders no mail), and work.
 *
 * @param job - the job to run
 */
const execute = (job: JobDeclaration): Promise<void> =>
    job.connectFirst === false
        ? runJobWork(job).then(() => startJob())
        : startJob()
              .then(() => prepareJob())
              .then(() => runJobWork(job));

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

// A job process has no forced-exit deadline: it must give up on a dead broker, not retry forever.
boundQueueRetries();

// Entry point: run the job, record its outcome under its name (a leased job records through its own
// lease document, since a skipped run must not read as a success), and close the connections on
// both paths. See `scripts/run-script.ts`.
// eslint-disable-next-line @typescript-eslint/no-floating-promises -- runScript never rejects (failure is reported via process.exitCode)
void runScript(
    job.lease ? undefined : job.name,
    () => execute(job),
    () => Promise.all([stopDatabase(), stopQueue()])
);
