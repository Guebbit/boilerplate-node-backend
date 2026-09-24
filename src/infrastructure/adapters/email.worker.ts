/**
 * @module
 * Drains one queued email job: render the EJS template, send over SMTP. The consumer counterpart
 * to `enqueueEmail` in `adapters/mailer.ts`, wired up by `consumeFromQueue` when a broker is
 * configured. No locale handling here — the producer already resolved every string before
 * publishing, so this file only interpolates and sends.
 *
 * See: docs/tools/email-and-rendering.md
 */

import type { EmailJobPayload } from '@types';
import { sendTemplatedEmail } from '@infrastructure/adapters/mailer';
import { discardSpooled } from '@infrastructure/adapters/mail-spool';
import { logger } from '@infrastructure/adapters/logger';

/* Queue name for email jobs — owned by the adapter, re-exported for the worker registry. */
export { EMAIL_QUEUE } from '@infrastructure/adapters/queue';

/**
 * Discards every attachment a job spooled. Called only on the two outcomes
 * {@link handleEmailJob} treats as FINAL — a successful send, or a permanent refusal — never on a
 * rethrow, which still has retry attempts ahead of it and needs its attachment intact for them.
 *
 * @param attachments - a job's own `request.attachments`, absent for a payload with none
 */
const discardJobAttachments = (
    attachments: EmailJobPayload['request']['attachments'] = []
): Promise<void> =>
    Promise.all(attachments.map(({ key }) => discardSpooled(key))).then(() => undefined);

/**
 * Process a single email job from the queue.
 *
 * `false` is a PERMANENT refusal — no recipient or template, so it's dead-lettered. Anything else
 * is left to reject, since an SMTP fault says nothing about the job and `consumeFromQueue` retries
 * a rejection via its TTL retry queue, not an immediate requeue. `Partial<EmailJobPayload>`, not
 * `unknown`: the broker delivers whatever was published, so every field is a claim until checked
 * below.
 */
export const handleEmailJob = (job: Partial<EmailJobPayload>): Promise<boolean> => {
    // The optional chain does the narrowing on its own — past this point TypeScript knows both
    // fields are there, which is why no type predicate is needed to say so.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the payload crossed a queue: its type is a claim, not a fact
    if (!job?.request?.to || !job.templateName) {
        // Stryker disable next-line all
        logger.warn({ message: 'Invalid email job payload, discarding.', job });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- same as above: a broker can deliver a null job
        return discardJobAttachments(job?.request?.attachments).then(() => false);
    }

    /*
     * No locale handling here, by design: this job may run in another process long after the
     * request ended, so there's no locale store to restore. The producer already resolved every
     * string before publishing — `job.data` is finished copy — so this only interpolates and sends.
     */
    return (
        sendTemplatedEmail(job.request, job.templateName, job.data ?? {})
            // `!`: proven present by the guard above, which the compiler cannot follow into this closure.
            .then(() => discardJobAttachments(job.request!.attachments).then(() => true))
            .catch((error: unknown) => {
                // Logged AND rethrown, attachment untouched: the TTL retry is what saves the email —
                // and the next attempt still needs a file to resolve — the log is what makes a job
                // that keeps failing visible instead of a queue that quietly refills.
                // Stryker disable next-line all
                logger.error({ message: 'Email worker failed to send.', error });
                throw error;
            })
    );
};
