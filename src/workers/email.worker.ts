import type { SendMailOptions } from 'nodemailer';
import type { IEmailJobPayload } from '@types';
import { nodemailer } from '@core/adapters/mailer';
import { logger } from '@core/adapters/logger';
import { getFallbackLocale, runWithLocale } from '@core/i18n';

/*
 * Queue name for email jobs
 */
export const EMAIL_QUEUE = 'emails';

/*
 * Payload shape for email jobs — extends the AsyncAPI contract with full Nodemailer options
 */
export interface IEmailJob extends Omit<IEmailJobPayload, 'request'> {
    request: SendMailOptions;
}

/**
 * Process a single email job from the queue.
 * Returns true to ack on success, false to nack (dead-letter) on permanent failure.
 */
export const handleEmailJob = (message: unknown): Promise<boolean> => {
    const job = message as IEmailJob;

    if (!job?.request?.to || !job?.templateName) {
        logger.warn({ message: 'Invalid email job payload, discarding.', job });
        return Promise.resolve(false);
    }

    /*
     * Re-establish the locale the producer recorded before rendering.
     *
     * This is the boundary AsyncLocalStorage cannot cross: the request that enqueued this job
     * finished long ago and may have run in another process entirely, so the store is gone and
     * the ambient `t` would silently fall back to the boot language. `runWithLocale` puts the
     * payload's locale back on THIS chain, which is what the template's `t` then resolves
     * against. A job carrying no locale gets the fallback.
     */
    return runWithLocale(job.locale ?? getFallbackLocale(), () =>
        nodemailer(job.request, job.templateName, job.data ?? {})
            .then(() => true)
            .catch((error: Error) => {
                logger.error({ message: 'Email worker failed to send.', error: error.message });
                // Returning false = nack without requeue (goes to dead-letter if configured).
                return false;
            })
    );
};
