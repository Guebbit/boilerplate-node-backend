import type { SendMailOptions } from 'nodemailer';
import type { Data } from 'ejs';
import { nodemailer } from '@utils/nodemailer';
import { logger } from '@utils/winston';

/** Queue name for email jobs. */
export const EMAIL_QUEUE = 'emails';

/** Payload shape for email jobs pushed into the queue. */
export interface IEmailJob {
    request: SendMailOptions;
    templateName: string;
    data: Data;
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

    return nodemailer(job.request, job.templateName, job.data ?? {})
        .then(() => true)
        .catch((error: Error) => {
            logger.error({ message: 'Email worker failed to send.', error: error.message });
            // Returning false = nack without requeue (goes to dead-letter if configured).
            return false;
        });
};
