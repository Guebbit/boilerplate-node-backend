/**
 * @module
 * Letting the background half of a step finish. A journey asserts on end states, and half of them
 * are written after the response: outbox rows delivered to their listeners, and sweeps that run on
 * a schedule in production.
 */
import { resolveJobs } from '@kernel/registry';
import { settleOutboxNudges } from '@kernel/outbox';
import { appJobs } from '../../src/app/jobs';
import { enabledModules } from '../../src/modules';

/** Every declared job, by name. */
const JOBS = new Map(
    [...appJobs, ...resolveJobs(enabledModules)].map((job) => [job.name, job] as const)
);

/**
 * Runs one declared job once, in-process: the same function `POST /__test/jobs/:name` calls.
 *
 * @param name - the job's name, such as `sweep:reservations`
 * @returns whatever the job resolves
 * @throws {Error} when no job has that name
 */
export const runJob = (name: string): Promise<unknown> => {
    const job = JOBS.get(name);
    if (!job) throw new Error(`no job named ${name}`);

    return job.run();
};

/**
 * Delivers every pending outbox row, then runs the named jobs in order, then delivers what they
 * announced.
 *
 * @param jobs - job names to run between the two settles
 */
export const drain = async (...jobs: string[]): Promise<void> => {
    await settleOutboxNudges();
    for (const name of jobs) await runJob(name);
    await settleOutboxNudges();
};
