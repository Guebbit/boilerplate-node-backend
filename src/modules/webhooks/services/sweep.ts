/**
 * @module
 * The retry sweep: publish every delivery due for another attempt, plus any stranded `in-flight`
 * row whose lease already expired (`ops/sweep-webhook-retries.ts` runs
 * {@link sweepDueWebhookDeliveries} on a schedule, per-minute, unlike the nightly `reap:*` jobs —
 * see the script's own header).
 *
 * Publishes WITHOUT claiming — the fix for the bug this lease design closes: only a worker
 * (`./attempt.ts#processDeliveryJob`) or an admin replay actually claims a row, via
 * `repository.ts`'s lease. A row published twice (this sweep's own overlapping runs, or the fast
 * path racing a stranded-row republish) is safe: whichever claim lands first does the one real
 * HTTP attempt, and every other delivery of the same message finds the row already under a live
 * lease and acks as a no-op.
 */

import { logger } from '@infrastructure/adapters/logger';
import { publishToQueue } from '@infrastructure/adapters/queue';
import { WORKER_CHANNELS } from '@types';
import type { WebhookDeliverJobPayload } from '@types';
import { webhookDeliveryRepository } from '../repository';
import type { WebhookDeliveryDocument } from '../model';

/** The ceiling one sweep run enqueues, so a very late sweep cannot burst-publish an unbounded batch. */
const SWEEP_BATCH_LIMIT = 200;

/** Publish one due row's next attempt. Never claims — see the module docblock. */
const enqueue = (due: WebhookDeliveryDocument): Promise<void> => {
    const payload: WebhookDeliverJobPayload = {
        deliveryId: String(due._id),
        subscriptionId: String(due.subscriptionId),
        eventId: due.eventId,
        eventType: due.eventType,
        occurredAt: due.createdAt.toISOString(),
        data: due.payload,
        attempt: due.attempt
    };

    return publishToQueue<WebhookDeliverJobPayload>({
        queue: WORKER_CHANNELS.WEBHOOK_DELIVER,
        payload
    }).then(() => undefined);
};

/**
 * Enqueue every delivery due for a retry right now, plus every stranded lease — see
 * `repository.ts#findDue`. Idempotent: publishing a row that is already being worked costs one
 * wasted message, never a duplicate delivery — the claim in `./attempt.ts` is what actually decides.
 */
export const sweepDueWebhookDeliveries = (): Promise<void> =>
    webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT).then((due) => {
        logger.info({ message: 'webhooks: sweeping due retries', count: due.length });
        return Promise.all(due.map((delivery) => enqueue(delivery))).then(() => undefined);
    });
