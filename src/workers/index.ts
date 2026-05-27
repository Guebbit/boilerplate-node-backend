import { consumeFromQueue, isQueueEnabled } from '@utils/queue';
import { logger } from '@utils/winston';
import { EMAIL_QUEUE, handleEmailJob } from './email.worker';
import { PDF_QUEUE, handlePdfJob } from './pdf.worker';

/**
 * Register all queue consumers.
 * Called once during app startup — no-op when RabbitMQ is disabled.
 */
export const registerWorkers = (): Promise<void> => {
    if (!isQueueEnabled()) return Promise.resolve();

    logger.info('Registering queue workers...');
    return Promise.all([
        consumeFromQueue({ queue: EMAIL_QUEUE, handler: handleEmailJob, prefetch: 5 }),
        consumeFromQueue({ queue: PDF_QUEUE, handler: handlePdfJob, prefetch: 2 })
    ]).then(() => {
        logger.info('Queue workers registered.');
    });
};
