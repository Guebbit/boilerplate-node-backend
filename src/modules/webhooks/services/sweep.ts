/**
 * @module
 * The retry sweep: every delivery due for another attempt, plus any stranded `in_flight` row whose
 * lease already expired. Two entry points over the same rows:
 *
 * `sweepDueWebhookDeliveries`   the cron job (`sweep:webhook-retries`, per minute). Publishes each
 *                               row WITHOUT claiming; a worker sends it. With NO broker configured
 *                               it sends the row itself. With a broker configured but down it
 *                               leaves the rows: a worker sends them (below), and sending here too
 *                               would double every delivery.
 * `sendDueWebhookDeliveries`    the worker's `fallbackSweep` while the broker is down: sends each
 *                               due row itself, through the same `./attempt.ts#processDeliveryJob`
 *                               a queue consumer runs. The delivery row is the durable store, so
 *                               webhooks never write a `jobs` row.
 *
 * Either way it is the mailer's "degrade, don't drop" rule, run away from the request so a slow
 * subscriber never slows the API.
 *
 * Only a worker, an admin replay or a sweep's own inline send claims a row, via `repository.ts`'s
 * lease design. A row published twice (overlapping sweeps, or the fast path racing a stranded-row
 * republish) is safe: whichever claim lands first does the one real HTTP attempt, and every other
 * delivery of the same message finds the row already under a live lease.
 */

import { logger } from '@infrastructure/adapters/logger';
import { isQueueEnabled } from '@infrastructure/adapters/queue';
import { webhookDeliveryRepository } from '../repository';
import type { WebhookDeliveryDocument } from '../model';
import { processDeliveryJob } from './attempt';
import { enqueueDeliveryAttempt } from './enqueue';

/** The ceiling one sweep run handles, so a very late sweep cannot burst an unbounded batch. */
const SWEEP_BATCH_LIMIT = 200;

/**
 * How many rows are sent at once when there is no broker. Matches the consumer's `prefetch`
 * (`../module.ts`): one signed POST each, I/O-bound, and a dead endpoint's hard timeout must not
 * stack up serially past the sweep's own minute.
 */
const INLINE_CONCURRENCY = 5;

/**
 * Send one row now, through the same claim a queue consumer uses.
 *
 * @param delivery - a row due for an attempt
 */
const send = (delivery: WebhookDeliveryDocument): Promise<void> =>
    processDeliveryJob({ deliveryId: String(delivery._id) }).then(() => undefined);

/**
 * Publish one row; send it here only when no broker is configured at all. A configured broker that
 * refuses the message is a worker's to handle (see the module header), so the row stays due.
 *
 * @param delivery - a row due for an attempt
 */
const publishOrSend = (delivery: WebhookDeliveryDocument): Promise<void> =>
    enqueueDeliveryAttempt(delivery).then((published) =>
        published || isQueueEnabled() ? undefined : send(delivery)
    );

/**
 * Handle `rows` in groups of {@link INLINE_CONCURRENCY}, each group settled before the next
 * starts, each row by `handle`. A row that fails is logged and left for the next sweep: its claim was lease-based, so it
 * comes back due by itself.
 *
 * @param rows - the due rows
 * @param handle - what to do with one row
 */
const handleInGroups = (
    rows: readonly WebhookDeliveryDocument[],
    handle: (delivery: WebhookDeliveryDocument) => Promise<void>
): Promise<void> => {
    const [group, rest] = [rows.slice(0, INLINE_CONCURRENCY), rows.slice(INLINE_CONCURRENCY)];
    if (group.length === 0) return Promise.resolve();

    return Promise.allSettled(group.map((delivery) => handle(delivery))).then((outcomes) => {
        const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length;
        if (failed > 0)
            logger.error({
                message: 'webhooks: a swept delivery failed',
                failed,
                of: group.length
            });
        return handleInGroups(rest, handle);
    });
};

/**
 * Handle up to `SWEEP_BATCH_LIMIT` due deliveries with `handle`. Idempotent: handling a row that is
 * already being worked costs one wasted message or no-op claim, never a duplicate delivery: the
 * claim in `./attempt.ts` decides.
 *
 * @param handle - what to do with one due row
 */
const sweepWith = (handle: (delivery: WebhookDeliveryDocument) => Promise<void>): Promise<void> =>
    webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT).then((due) => {
        // Stryker disable next-line all
        logger.info({ message: 'webhooks: sweeping due retries', count: due.length });
        return handleInGroups(due, handle);
    });

/** The cron job: publish what is due (see the module header for when it sends). */
export const sweepDueWebhookDeliveries = (): Promise<void> => sweepWith(publishOrSend);

/** The worker's fallback while the broker is down: send what is due, here. */
export const sendDueWebhookDeliveries = (): Promise<void> => sweepWith(send);
