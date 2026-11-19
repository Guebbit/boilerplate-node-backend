/**
 * @module
 * The one door a producer hands a job through: published to the broker, or HELD in the durable
 * fallback queue when the broker is configured but down. Never dropped, and never run inside the
 * request because the broker is down.
 *
 * Answers:   `published`   the broker confirmed it.
 *            `held`        the broker is down; a worker drains it from `jobs` (`src/infrastructure/adapters/job-drain.ts`).
 *            `inline`      no broker is configured at all (a development box, an integration test),
 *                          so nobody consumes a queue: the caller runs the work itself, as it
 *                          always did.
 * Why:       a broker outage used to push every job back onto the web process, where a mail's SMTP
 *            wait, an image decode and a whole-account export all landed on request threads.
 *
 * @see docs/understand/rabbitmq.md#when-the-broker-is-down
 */

import { logger } from '@infrastructure/adapters/logger';
import {
    isQueueEnabled,
    publishToQueue,
    type PublishOptions
} from '@infrastructure/adapters/queue';
import { holdJob } from '@infrastructure/persistence/job-store';

/** Where a dispatched job went. See the module header. */
export type DispatchOutcome = 'published' | 'held' | 'inline';

/**
 * Hand one job to the broker, or to the durable fallback queue.
 *
 * @param options - the queue, and the payload (JSON-serializable)
 * @returns where the job went; `inline` when the caller must run it, either because no broker is
 *   configured or because even the fallback store refused it (logged, so the work is not lost)
 */
export const dispatchJob = <TPayload>(
    options: PublishOptions<TPayload>
): Promise<DispatchOutcome> =>
    publishToQueue(options).then((published) => {
        if (published) return 'published';
        // Not configured: no queue exists to wait on, so there is nothing to hold the job for.
        if (!isQueueEnabled()) return 'inline';

        return holdJob(options.queue, options.payload).then(
            (): DispatchOutcome => 'held',
            (error: unknown): DispatchOutcome => {
                // Stryker disable next-line all
                logger.error({
                    message: 'Could not hold a job while the broker is down; running it inline.',
                    queue: options.queue,
                    error
                });
                return 'inline';
            }
        );
    });
