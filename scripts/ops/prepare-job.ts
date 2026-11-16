/**
 * @module
 * What a scheduled job gets installed before it runs, and the work step after: the pieces
 * `run-job.ts` and the tests that drive a job through the runner's own path share.
 *
 * Every job boots like the app does, so a mail built in cron reads like one built in the web
 * process. There is no per-job opt-in: a list a job must remember to fill has been under-filled
 * three times.
 */
import { logger } from '@infrastructure/adapters/logger';
import { withLease } from '@infrastructure/persistence/lease';
import { settleOutboxNudges } from '@kernel/outbox';
import { registerModules, type JobDeclaration } from '@kernel/registry';
import { bootRendering } from '../../src/app/boot-rendering';
import { enabledModules } from '../../src/modules';

/**
 * Install what the app installs before it sends anything: every module's event subscriptions
 * (an event is unheard without them, and the outbox relay refuses to run with none), then the
 * translations, mail templates and admin copy overlay.
 *
 * Needs the database: the overlay is read from it. A `connectFirst: false` job skips this.
 */
export const prepareJob = (): Promise<void> => {
    registerModules(enabledModules);
    return bootRendering();
};

/**
 * The work itself, under the lease when the job has one, plain otherwise. Whatever the job
 * announced is settled before it returns (inside the lease), so the listeners, and the mail they
 * build, have run before the connections close.
 *
 * @param job - the job to run
 */
export const runJobWork = (job: JobDeclaration): Promise<void> => {
    const run = () => job.run().then(() => settleOutboxNudges());
    if (!job.lease) return run();
    /**
     * `true` marks "it ran": `withLease` answers `undefined` for a skipped run, and a job's own
     * result is often `undefined` too.
     */
    return withLease(job.name, job.lease.ttlMs, () => run().then(() => true)).then((ran) => {
        if (ran === undefined)
            logger.info({ message: `${job.name} skipped: another holder already has the lease.` });
    });
};
