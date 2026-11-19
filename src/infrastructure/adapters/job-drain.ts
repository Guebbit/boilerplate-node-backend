/**
 * @module
 * The worker's half of the durable fallback queue: loops that take held jobs out of `jobs`
 * (`src/infrastructure/persistence/job-store.ts`) and run them through the same handler and schema the broker's
 * consumer uses. A held job and a delivered one end the same way.
 *
 * Loops:     the urgent mail channel has its own, so a backlog of ordinary jobs is never ahead of a
 *            reset link; every other channel this role serves shares the second.
 * Pace:      busy, the next claim follows at once; idle, one poll every {@link IDLE_POLL_MS}. One
 *            job at a time per loop: this is the rare path, not the broker's prefetch.
 * Failure:   a throw is retried after `NODE_QUEUE_RETRY_DELAY_SECONDS`, and parked as `dead` after
 *            `NODE_QUEUE_MAX_ATTEMPTS`, the same numbers the broker's consumers use. A parked job
 *            counts in `queue_jobs_dead_lettered_total`, which is what the alert reads.
 * Fallback:  a consumer whose work has its OWN durable row (a webhook delivery) declares a
 *            `fallbackSweep`; while the broker is down this loop runs it, so that work is sent by a
 *            worker instead of waiting for the broker.
 *
 * @see docs/understand/rabbitmq.md#when-the-broker-is-down
 */

import type { ZodType } from 'zod';
import { extractErrorMessage } from '@guebbit/js-toolkit';
import { logger } from '@infrastructure/adapters/logger';
import { queueConfig } from '@infrastructure/adapters/config';
import { isServedBy } from '@infrastructure/adapters/job-kinds';
import { queueState } from '@infrastructure/adapters/queue';
import { queueJobsDeadLetteredTotal } from '@infrastructure/observability/metrics-queue';
import {
    CLAIM_LEASE_MS,
    claimNextJob,
    completeJob,
    parkJob,
    renewJobLease,
    retryJobLater,
    type JobDocument
} from '@infrastructure/persistence/job-store';
import type { WorkerRole } from '@infrastructure/runtime/config';
import { settleWithin } from '@infrastructure/runtime/settle';
import { WORKER_CHANNELS } from '@types';

/** What the drain needs of a consumer: the same three things `consumeFromQueue` takes, plus the hook. */
export interface DrainConsumer {
    /** The channel whose held jobs this runs. */
    queue: string;
    /** Return true when done, false to PARK a permanent refusal, throw for a transient failure. */
    handler(message: unknown): Promise<boolean>;
    /** The contract a held payload must still satisfy when it is claimed. */
    schema: ZodType;
    /** Sends what the broker would have carried, from the work's own durable rows. See the module header. */
    fallbackSweep?: () => Promise<void>;
}

/** How long an idle loop waits before it asks for another job. */
const IDLE_POLL_MS = 5000;

/** The longest between two runs of the consumers' `fallbackSweep` while the broker is down. */
const FALLBACK_SWEEP_EVERY_MS = 15_000;

/** The urgent mail channel, which has a loop of its own. */
const URGENT_CHANNELS: ReadonlySet<string> = new Set([WORKER_CHANNELS.EMAIL_URGENT]);

/** Whether the loops should stop at their next turn. */
let stopped = true;

/** Timers waiting for the next turn of a loop, cleared on stop. */
const timers = new Set<NodeJS.Timeout>();

/** Turns in progress, so {@link stopJobDrain} can let them finish. */
const turnsInFlight = new Set<Promise<unknown>>();

/**
 * Park a job and count it, so the dead-letter alert sees held jobs too.
 *
 * @param job - the claimed row
 * @param reason - why, kept on the row
 */
const park = (job: JobDocument, reason: string): Promise<void> => {
    queueJobsDeadLetteredTotal.inc({ queue: job.channel });
    // Stryker disable next-line all
    logger.warn({ message: 'A held job was parked.', queue: job.channel, reason });
    return parkJob(job, reason);
};

/**
 * Keep a running job's claim alive until `running` settles, renewing it every third of the lease. A
 * build that outlasts the lease (an account export) would otherwise be claimed again by another
 * copy and run twice; a worker that DIES stops renewing, and the lease lapses on its own.
 *
 * @param job - the claimed row
 * @param running - the handler's promise
 * @returns `running`'s own outcome
 */
const renewWhile = <T>(job: JobDocument, running: Promise<T>): Promise<T> => {
    const timer = setInterval(() => {
        renewJobLease(job, CLAIM_LEASE_MS).catch((error: unknown) => {
            logger.warn({
                message: 'Could not renew a held job lease.',
                queue: job.channel,
                error
            });
        });
    }, CLAIM_LEASE_MS / 3);
    // Never, on its own, the thing keeping a process alive.
    timer.unref();
    return running.finally(() => {
        clearInterval(timer);
    });
};

/**
 * Run one claimed job and record how it went.
 *
 * @param job - the claimed row
 * @param consumer - the handler and schema for its channel
 */
const runJob = (job: JobDocument, consumer: DrainConsumer): Promise<void> => {
    const verdict = consumer.schema.safeParse(job.payload);
    if (!verdict.success) return park(job, 'payload failed contract validation');

    return renewWhile(
        job,
        Promise.resolve().then(() => consumer.handler(verdict.data))
    ).then(
        (done) => (done ? completeJob(job) : park(job, 'the handler refused the job')),
        (error: unknown) => {
            const message = extractErrorMessage(error, String(error));
            const { NODE_QUEUE_MAX_ATTEMPTS, NODE_QUEUE_RETRY_DELAY_SECONDS } = queueConfig();
            if (job.attempts + 1 >= NODE_QUEUE_MAX_ATTEMPTS) return park(job, message);
            return retryJobLater(job, message, NODE_QUEUE_RETRY_DELAY_SECONDS * 1000);
        }
    );
};

/**
 * Claim and run at most one job of `channels`.
 *
 * @param channels - the channels this loop serves
 * @param byChannel - the consumers, by channel
 * @returns whether a job was found, so the loop knows to ask again at once
 */
const takeOne = (
    channels: readonly string[],
    byChannel: ReadonlyMap<string, DrainConsumer>
): Promise<boolean> =>
    claimNextJob(channels, CLAIM_LEASE_MS).then((job) => {
        if (!job) return false;
        const consumer = byChannel.get(job.channel);
        // A channel in `channels` always has a consumer; a missing one would only be a stale row.
        if (!consumer) return park(job, 'no consumer for this channel').then(() => true);
        return runJob(job, consumer).then(() => true);
    });

/**
 * One loop over `channels`, until {@link stopJobDrain}.
 *
 * @param channels - the channels this loop serves
 * @param byChannel - the consumers, by channel
 * @param sweeps - the `fallbackSweep`s this loop runs while the broker is down; empty for the urgent loop
 */
const loop = (
    channels: readonly string[],
    byChannel: ReadonlyMap<string, DrainConsumer>,
    sweeps: readonly (() => Promise<void>)[]
): void => {
    let lastSweepAt = 0;

    /** Run the fallback sweeps when the broker is down and they are due. */
    const sweepIfDown = (): Promise<void> => {
        if (sweeps.length === 0 || queueState() !== 'unavailable') return Promise.resolve();
        if (Date.now() - lastSweepAt < FALLBACK_SWEEP_EVERY_MS) return Promise.resolve();
        lastSweepAt = Date.now();
        return Promise.allSettled(sweeps.map((sweep) => sweep())).then((outcomes) => {
            for (const outcome of outcomes)
                if (outcome.status === 'rejected')
                    logger.error({ message: 'A fallback sweep failed.', error: outcome.reason });
        });
    };

    const turn = (): void => {
        if (stopped) return;
        const running: Promise<unknown> = sweepIfDown()
            .then(() => takeOne(channels, byChannel))
            .catch((error: unknown) => {
                logger.error({ message: 'Job drain turn failed.', error });
                return false;
            })
            .then((found) => {
                turnsInFlight.delete(running);
                if (stopped) return;
                const timer = setTimeout(
                    () => {
                        timers.delete(timer);
                        turn();
                    },
                    found ? 0 : IDLE_POLL_MS
                );
                // Never, on its own, the thing keeping a process alive.
                timer.unref();
                timers.add(timer);
            });
        turnsInFlight.add(running);
    };

    turn();
};

/**
 * Start the loops for what a worker of `role` serves. Idempotent: a second call while running does nothing.
 *
 * @param consumers - every consumer the process knows (the loops pick the ones `role` serves)
 * @param role - which kinds of job this process takes
 */
export const startJobDrain = (consumers: readonly DrainConsumer[], role: WorkerRole): void => {
    if (!stopped) return;
    const served = consumers.filter(({ queue }) => isServedBy(role, queue));
    if (served.length === 0) return;
    stopped = false;

    const byChannel = new Map(served.map((consumer) => [consumer.queue, consumer] as const));
    const urgent = served.filter(({ queue }) => URGENT_CHANNELS.has(queue));
    const rest = served.filter(({ queue }) => !URGENT_CHANNELS.has(queue));

    if (urgent.length > 0)
        loop(
            urgent.map(({ queue }) => queue),
            byChannel,
            []
        );
    if (rest.length > 0)
        loop(
            rest.map(({ queue }) => queue),
            byChannel,
            rest.flatMap(({ fallbackSweep }) => (fallbackSweep ? [fallbackSweep] : []))
        );
};

/**
 * Stop the loops and wait for the turns running now.
 *
 * @param timeoutMs - the most to wait for a running job
 */
export const stopJobDrain = (timeoutMs: number): Promise<void> => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    return settleWithin(turnsInFlight, timeoutMs);
};
