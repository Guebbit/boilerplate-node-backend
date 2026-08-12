import { consumeFromQueue, isQueueEnabled } from '@infrastructure/adapters/queue';
import { logger } from '@infrastructure/adapters/logger';
import { EMAIL_QUEUE, handleEmailJob } from '@infrastructure/adapters/email.worker';
import { PDF_QUEUE, handlePdfJob } from '@infrastructure/adapters/pdf.worker';

/**
 * Register all queue consumers.
 * Called once during app startup — no-op when RabbitMQ is disabled.
 *
 * **This file is `app`, while the handlers it wires are `infrastructure`.** Sending an email and rendering a
 * PDF are verbs that still make sense in an application with no modules at all, so each consumer
 * lives beside the adapter it is the queue-side half of. Naming *which* queues this build drains is
 * the assembly decision, and that is what stayed here. A domain-owned worker would belong to its
 * module; there is not one yet.
 *
 * Worth knowing: **nothing publishes to `PDF_QUEUE`.** The order invoice endpoint calls
 * `renderHtmlToPdf` synchronously on the request path, so this consumer drains a queue that has no
 * producer. It is left registered deliberately — it is the working example of the async pattern,
 * and moving invoice rendering off the request path is a feature decision, not a cleanup.
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
