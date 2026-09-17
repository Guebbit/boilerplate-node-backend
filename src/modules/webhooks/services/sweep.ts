/**
 * @module
 * The retry sweep: enqueue every delivery due for another attempt. `ops/sweep-webhook-retries.ts`
 * runs {@link sweepDueWebhookDeliveries} on a schedule (per-minute, unlike the nightly `reap:*`
 * jobs — see the script's own header). Claims each due row atomically before publishing
 * (`webhookDeliveryRepository.claimPending`, `pending` -> `in-flight`) so a sweep overlapping its
 * own previous run, or racing the fast-path publish on a fresh event, cannot enqueue the same
 * delivery twice.
 */

import { logger } from '@infrastructure/adapters/logger';
import { publishToQueue } from '@infrastructure/adapters/queue';
import { WORKER_CHANNELS } from '@types';
import type { WebhookDeliverJobPayload } from '@types';
import { webhookDeliveryRepository } from '../repository';
import type { WebhookDeliveryDocument } from '../model';

/** The ceiling one sweep run enqueues, so a very late sweep cannot burst-publish an unbounded batch. */
const SWEEP_BATCH_LIMIT = 200;

/** Undo a claim the queue never accepted, so the row waits for the NEXT sweep instead of stranding `in-flight` forever. */
const revertClaim = (delivery: WebhookDeliveryDocument): Promise<void> => {
    delivery.status = 'pending';
    return webhookDeliveryRepository.save(delivery).then(() => undefined);
};

/** Claim one due row and enqueue it — or, if claimed first by a sibling, do nothing. */
const claimAndEnqueue = (due: WebhookDeliveryDocument): Promise<void> =>
    webhookDeliveryRepository.claimPending(String(due._id)).then((claimed) => {
        if (!claimed) return undefined;

        const payload: WebhookDeliverJobPayload = {
            deliveryId: String(claimed._id),
            subscriptionId: String(claimed.subscriptionId),
            eventId: claimed.eventId,
            eventType: claimed.eventType,
            occurredAt: claimed.createdAt.toISOString(),
            data: claimed.payload,
            attempt: claimed.attempt
        };

        return publishToQueue<WebhookDeliverJobPayload>({
            queue: WORKER_CHANNELS.WEBHOOK_DELIVER,
            payload
        }).then((published) => (published ? undefined : revertClaim(claimed)));
    });

/**
 * Enqueue every delivery due for a retry right now. Idempotent — a row already claimed by another
 * pass, or no longer `pending`, is simply skipped; see the module docblock.
 */
export const sweepDueWebhookDeliveries = (): Promise<void> =>
    webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT).then((due) => {
        logger.info({ message: 'webhooks: sweeping due retries', count: due.length });
        return Promise.all(due.map((delivery) => claimAndEnqueue(delivery))).then(() => undefined);
    });
