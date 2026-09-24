/**
 * @module
 * The one queue publish `publish.ts` (the fast path, right after a delivery row is created) and
 * `sweep.ts` (the retry sweep, for a row already due) both need — Claim Check (EIP): the message
 * carries only the row's id, since the row itself is the source of truth for everything an attempt
 * needs. See `../asyncapi.internal.yaml`'s own schema docblock.
 */

import { publishToQueue } from '@infrastructure/adapters/queue';
import { WORKER_CHANNELS } from '@types';
import type { WebhookDeliverJobPayload } from '@types';
import type { WebhookDeliveryDocument } from '../model';

/**
 * Publish one delivery row's next attempt. Never claims: publishing an already-live row twice is
 * safe, since the WORKER's own claim (`./attempt.ts`) is what decides who actually does the one
 * real HTTP attempt.
 */
export const enqueueDeliveryAttempt = (delivery: WebhookDeliveryDocument): Promise<void> => {
    const payload: WebhookDeliverJobPayload = { deliveryId: String(delivery._id) };

    return publishToQueue<WebhookDeliverJobPayload>({
        queue: WORKER_CHANNELS.WEBHOOK_DELIVER,
        payload
    }).then(() => undefined);
};
