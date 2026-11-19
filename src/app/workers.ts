/**
 * @module
 * Queue-consumer registration for this build, run by the worker process (`src/worker.ts`).
 *
 * This file is `app`; the email/image handlers it wires directly are `infrastructure`, because
 * sending an email and digesting an upload make sense in an application with no modules at all —
 * naming those two queues is the assembly decision. A module-owned queue (webhooks'
 * `worker.webhook.deliver`) is not named here at all: it is collected from every enabled module's
 * own manifest instead, via `resolveConsumers` — see `ModuleConsumer` (`@kernel/registry.ts`) for
 * why a module cannot call `consumeFromQueue` itself.
 *
 * @see docs/understand/rabbitmq.md#where-the-code-lives
 */

import { consumeFromQueue, isQueueEnabled } from '@infrastructure/adapters/queue';
import { logger } from '@infrastructure/adapters/logger';
import { EMAIL_QUEUE, handleEmailJob } from '@infrastructure/adapters/email.worker';
import {
    IMAGE_QUEUE,
    handleImageDigestJob,
    registerImageWritebackResolver
} from '@infrastructure/adapters/image.worker';
import { EmailJobPayloadSchema, ImageDigestJobPayloadSchema } from '@types';
import { resolveImageTargets, resolveConsumers } from '@kernel/registry';
import { enabledModules } from '../modules';

/**
 * Tell the image pipeline where each module wants its finished image written back.
 *
 * Needed by BOTH process roles, with or without a broker: the worker runs the digest job, and
 * the web process runs it inline when the broker is unconfigured or down. This is the one place
 * allowed to see every module's `imageTargets` (see `ImageWriteback` in
 * `infrastructure/adapters/image.worker.ts` for why the pipeline cannot resolve this itself).
 */
export const registerImageWriteback = (): void => {
    const imageTargets = resolveImageTargets(enabledModules);
    registerImageWritebackResolver((collection) => imageTargets[collection]?.writeback);
};

/**
 * Register all queue consumers. Called once by the worker process (`src/worker.ts`), never by the
 * web process: the API publishes jobs, the worker takes them. No-op when RabbitMQ is disabled.
 */
export const registerWorkers = (): Promise<void> => {
    if (!isQueueEnabled()) {
        // Stryker disable next-line all
        logger.info('Queue disabled: this worker has nothing to consume.');
        return Promise.resolve();
    }

    // Stryker disable next-line all
    logger.info('Registering queue workers...');
    return Promise.all([
        /**
         * `prefetch: 5` — sending an email is I/O-bound, not CPU-bound, so several in flight per
         * worker is cheap.
         */
        consumeFromQueue({
            queue: EMAIL_QUEUE,
            handler: handleEmailJob,
            schema: EmailJobPayloadSchema,
            prefetch: 5
        }),
        /**
         * `prefetch: 1` — decoding, re-encoding and thumbnailing is the most CPU-bound job this
         * process runs; one at a time per worker keeps a burst of uploads from starving requests.
         */
        consumeFromQueue({
            queue: IMAGE_QUEUE,
            handler: handleImageDigestJob,
            schema: ImageDigestJobPayloadSchema,
            prefetch: 1
        }),
        /**
         * Every module-declared consumer — webhooks' `worker.webhook.deliver` today, whatever a
         * future module adds tomorrow, with no edit needed here either time.
         */
        ...resolveConsumers(enabledModules).map((consumer) => consumeFromQueue(consumer))
    ]).then(() => {
        // Stryker disable next-line all
        logger.info('Queue workers registered.');
    });
};
