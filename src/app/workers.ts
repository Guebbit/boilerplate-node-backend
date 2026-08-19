import { consumeFromQueue, isQueueEnabled } from '@infrastructure/adapters/queue';
import { logger } from '@infrastructure/adapters/logger';
import { EMAIL_QUEUE, handleEmailJob } from '@infrastructure/adapters/email.worker';
import { PDF_QUEUE, handlePdfJob } from '@infrastructure/adapters/pdf.worker';

/**
 * Register all queue consumers.
 * Called once during app startup — no-op when RabbitMQ is disabled.
 *
 * This file is `app`; the handlers it wires are `infrastructure`, because sending an email and
 * rendering a PDF make sense in an application with no modules at all. Naming *which* queues this
 * build drains is the assembly decision.
 *
 * Worth knowing: **nothing publishes to `PDF_QUEUE`.** The invoice endpoint renders synchronously
 * on the request path, so this consumer drains a producerless queue. Left registered on purpose as
 * the worked example of the async pattern.
 *
 * See: docs/tools/rabbitmq.md
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
