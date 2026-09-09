/**
 * @module
 * Consumes `worker.webhook.deliver` and hands each job to the webhooks module's own processor.
 * This file cannot import `@modules/webhooks` (infra imports nothing above it — see
 * `docs/theory/layers.md`), so it takes the resolver-registration shape
 * `registerImageWritebackResolver`/`registerAuditSink` already establish: the module registers a
 * process function at import time, this file just calls it.
 *
 * The substrate itself — sign, SSRF-check, POST, time out — lives in `./webhook-delivery.ts`, and
 * is called from INSIDE the registered processor, not here: this file's whole job is "consume the
 * queue, hand off the job", matching `email.worker.ts`/`pdf.worker.ts`/`image.worker.ts`'s shape.
 */

import type { WebhookDeliverJobPayload } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { WORKER_CHANNELS } from '@types';

/** Queue name for webhook delivery jobs — owned by the adapter, re-exported for the worker registry. */
export const WEBHOOK_QUEUE = WORKER_CHANNELS.WEBHOOK_DELIVER;

/** One job, fully processed: claimed, attempted, and its outcome recorded. `false`/throw per {@link registerWebhookDeliveryProcessor}'s doc. */
type WebhookDeliveryProcessor = (payload: WebhookDeliverJobPayload) => Promise<boolean>;

/**
 * The webhooks module's own job processor. `undefined` until `registerWebhookDeliveryProcessor`
 * runs — the state every test importing this file starts in, and the state a job arriving before
 * boot finishes wiring would see.
 */
let processJob: WebhookDeliveryProcessor | undefined;

/**
 * Install the module's processor. Called once, at import time, from `modules/webhooks/module.ts` —
 * same "installs itself as the sink" shape `registerAuditSink` uses, and for the same reason:
 * deleting the module should be enough to stop this queue meaning anything.
 *
 * @param processor - claims the delivery row a job names, attempts it, records the outcome
 */
export const registerWebhookDeliveryProcessor = (processor: WebhookDeliveryProcessor): void => {
    processJob = processor;
};

/**
 * Process a single webhook delivery job from the queue.
 *
 * `false` for a malformed payload or an unregistered module (both dead-lettered, same policy
 * `image.worker.ts` uses for its own unrecognised jobs). Anything the processor throws is left to
 * reject, so `consumeFromQueue` requeues it as transient — a DB hiccup, not a permanent refusal.
 */
export const handleWebhookDeliverJob = (
    job: Partial<WebhookDeliverJobPayload>
): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the payload crossed a queue: its type is a claim, not a fact
    if (!job?.deliveryId || !job.subscriptionId || !job.eventId || !job.eventType) {
        logger.warn({ message: 'Invalid webhook delivery job payload, discarding.', job });
        return Promise.resolve(false);
    }

    if (!processJob) {
        logger.warn({
            message: 'Webhook delivery job received before the module registered, discarding.'
        });
        return Promise.resolve(false);
    }

    return processJob(job as WebhookDeliverJobPayload);
};
