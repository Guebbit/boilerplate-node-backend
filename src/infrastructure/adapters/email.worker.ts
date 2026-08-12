import type { IEmailJob } from '@infrastructure/adapters/mailer';
import { nodemailer } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';

/* Queue name for email jobs — owned by the adapter, re-exported for the worker registry. */
export { EMAIL_QUEUE } from '@infrastructure/adapters/queue';

/* Payload shape for email jobs — declared with the producer, re-exported for this queue's callers. */
export type { IEmailJob } from '@infrastructure/adapters/mailer';

/**
 * Process a single email job from the queue.
 * Returns true to ack on success, false to nack (dead-letter) on permanent failure.
 *
 * The parameter is the job type, not `unknown`: `consumeFromQueue` is generic, so the queue side
 * carries the shape here instead of handing over an opaque value for this function to assert about.
 * `Partial` is the honest half of that — the broker delivers whatever was published, possibly by an
 * older version of the producer, so every field is a claim until `isSendable` checks it.
 */
export const handleEmailJob = (job: Partial<IEmailJob>): Promise<boolean> => {
    // The optional chain does the narrowing on its own — past this point TypeScript knows both
    // fields are there, which is why no type predicate is needed to say so.
    if (!job?.request?.to || !job.templateName) {
        logger.warn({ message: 'Invalid email job payload, discarding.', job });
        return Promise.resolve(false);
    }

    /*
     * Render and send. No locale handling, and that is the design rather than an omission.
     *
     * The request that enqueued this job ended long ago, possibly in another process, so there is
     * no locale store on this async chain and nothing to restore one from. Instead of rebuilding
     * that context, the producer resolved every string before publishing — `job.data` is finished
     * copy — so the only thing left to do here is interpolate it into a template and hand the
     * result to SMTP.
     */
    return nodemailer(job.request, job.templateName, job.data ?? {})
        .then(() => true)
        .catch((error: Error) => {
            logger.error({ message: 'Email worker failed to send.', error: error.message });
            // Returning false = nack without requeue (goes to dead-letter if configured).
            return false;
        });
};
