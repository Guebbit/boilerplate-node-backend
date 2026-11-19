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

import {
    consumeFromQueue,
    EMAIL_URGENT_QUEUE,
    isQueueEnabled
} from '@infrastructure/adapters/queue';
import { logger } from '@infrastructure/adapters/logger';
import { startJobDrain } from '@infrastructure/adapters/job-drain';
import { isServedBy } from '@infrastructure/adapters/job-kinds';
import { serverConfig } from '@infrastructure/runtime/config';
import { EMAIL_QUEUE, handleEmailJob } from '@infrastructure/adapters/email.worker';
import {
    IMAGE_QUEUE,
    handleImageDigestJob,
    registerImageWritebackResolver
} from '@infrastructure/adapters/image.worker';
import { EmailJobPayloadSchema, ImageDigestJobPayloadSchema } from '@types';
import { resolveImageTargets, resolveConsumers, type ModuleConsumer } from '@kernel/registry';
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
 * Every consumer this build knows, whatever the role: the two infrastructure queues, the urgent
 * mail queue, and each module's own. {@link registerWorkers} keeps the ones its role serves.
 *
 * `prefetch: 5` on mail — sending is I/O-bound, so several in flight per worker is cheap.
 * `prefetch: 1` on images — decoding, re-encoding and thumbnailing is the most CPU-bound job this
 * build runs; one at a time keeps a burst of uploads from starving everything else in the process.
 * The urgent queue is the same handler on its own consumer, so ordinary mail never waits ahead of
 * a reset link.
 */
const allConsumers = (): readonly ModuleConsumer[] => [
    {
        queue: EMAIL_QUEUE,
        handler: handleEmailJob,
        schema: EmailJobPayloadSchema,
        prefetch: 5
    },
    {
        queue: EMAIL_URGENT_QUEUE,
        handler: handleEmailJob,
        schema: EmailJobPayloadSchema,
        prefetch: 5
    },
    {
        queue: IMAGE_QUEUE,
        handler: handleImageDigestJob,
        schema: ImageDigestJobPayloadSchema,
        prefetch: 1
    },
    /**
     * Every module-declared consumer — webhooks' `worker.webhook.deliver` and account's
     * `worker.account.export` today, whatever a future module adds tomorrow, with no edit needed
     * here either time.
     */
    ...resolveConsumers(enabledModules)
];

/**
 * Register the queue consumers this process's role serves, and start draining the durable
 * fallback queue for the same channels. Called once by the worker process (`src/worker.ts`), never
 * by the web process: the API publishes jobs, the worker takes them. No-op when RabbitMQ is
 * disabled.
 *
 * @see docs/understand/rabbitmq.md#job-kinds
 */
export const registerWorkers = (): Promise<void> => {
    if (!isQueueEnabled()) {
        // Stryker disable next-line all
        logger.info('Queue disabled: this worker has nothing to consume.');
        return Promise.resolve();
    }

    const { NODE_WORKER_ROLE: role } = serverConfig();
    const consumers = allConsumers();
    // Stryker disable next-line all
    logger.info(`Registering ${role} queue workers...`);
    return Promise.all(
        consumers
            .filter(({ queue }) => isServedBy(role, queue))
            .map((consumer) =>
                consumeFromQueue({
                    queue: consumer.queue,
                    // Called on the consumer, not detached: a module's handler may be a method.
                    handler: (message) => consumer.handler(message),
                    schema: consumer.schema,
                    prefetch: consumer.prefetch
                })
            )
    ).then(() => {
        // Held jobs wait in the database while the broker is down; the same role drains them.
        startJobDrain(consumers, role);
        // Stryker disable next-line all
        logger.info('Queue workers registered.');
    });
};
