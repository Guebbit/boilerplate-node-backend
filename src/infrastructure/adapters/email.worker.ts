/**
 * @module
 * Drains one queued email job: render the EJS template, send over SMTP. The consumer counterpart
 * to `enqueueEmail` in `adapters/mailer.ts`, wired up by `consumeFromQueue` when a broker is
 * configured. No locale handling here — the producer already resolved every string before
 * publishing, so this file only interpolates and sends.
 *
 * See: docs/tools/email-and-rendering.md
 */

import type { EmailJob } from '@infrastructure/adapters/mailer';
import { nodemailer } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';

/* Queue name for email jobs — owned by the adapter, re-exported for the worker registry. */
export { EMAIL_QUEUE } from '@infrastructure/adapters/queue';

/**
 * Process a single email job from the queue.
 *
 * `false` is a PERMANENT refusal — no recipient or template, so it's dead-lettered. Anything else
 * is left to reject, since an SMTP fault says nothing about the job and `consumeFromQueue`
 * requeues a rejection. `Partial<EmailJob>`, not `unknown`: the broker delivers whatever was
 * published, so every field is a claim until checked below.
 */
export const handleEmailJob = (job: Partial<EmailJob>): Promise<boolean> => {
    // The optional chain does the narrowing on its own — past this point TypeScript knows both
    // fields are there, which is why no type predicate is needed to say so.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the payload crossed a queue: its type is a claim, not a fact
    if (!job?.request?.to || !job.templateName) {
        logger.warn({ message: 'Invalid email job payload, discarding.', job });
        return Promise.resolve(false);
    }

    /*
     * No locale handling here, by design: this job may run in another process long after the
     * request ended, so there's no locale store to restore. The producer already resolved every
     * string before publishing — `job.data` is finished copy — so this only interpolates and sends.
     */
    return nodemailer(job.request, job.templateName, job.data ?? {})
        .then(() => true)
        .catch((error: Error) => {
            // Logged AND rethrown: the requeue is what saves the email, the log is what makes a
            // job that keeps failing visible instead of a queue that quietly refills.
            logger.error({ message: 'Email worker failed to send.', error: error.message });
            throw error;
        });
};
