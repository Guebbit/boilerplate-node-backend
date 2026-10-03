/**
 * @module
 * The retry sweep: send every delivery due for another attempt, plus any stranded `in-flight`
 * row whose lease already expired (`scripts/ops/sweep-webhook-retries.ts` runs
 * {@link sweepDueWebhookDeliveries} on a schedule, per-minute, unlike the nightly `reap:*` jobs —
 * see the script's own header).
 *
 * With a broker: publishes each row WITHOUT claiming, and a worker sends it. Without one (or when
 * the broker refuses the message): the sweep sends the row itself, through the same
 * `./attempt.ts#processDeliveryJob` a worker runs — the same claim, the same lease, one HTTP
 * attempt. It is the mailer's "degrade, don't drop" rule, and it runs here rather than in the
 * request so a slow subscriber never slows the API.
 *
 * Only a worker, an admin replay or this sweep's own inline send claims a row, via `repository.ts`'s
 * lease design. A row published twice (this sweep's own overlapping runs, or the fast path racing a
 * stranded-row republish) is safe: whichever claim lands first does the one real HTTP attempt,
 * and every other delivery of the same message finds the row already under a live lease.
 */

import { logger } from '@infrastructure/adapters/logger';
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
 * Publish one row, or send it now when nobody will consume the message.
 *
 * @param delivery - a row due for an attempt
 */
const publishOrSend = (delivery: WebhookDeliveryDocument): Promise<void> =>
    enqueueDeliveryAttempt(delivery).then((published) =>
        published
            ? undefined
            : processDeliveryJob({ deliveryId: String(delivery._id) }).then(() => undefined)
    );

/**
 * Handle `rows` in groups of {@link INLINE_CONCURRENCY}, each group settled before the next
 * starts. A row that fails is logged and left for the next sweep: its claim was lease-based, so it
 * comes back due by itself.
 *
 * @param rows - the due rows
 */
const handleInGroups = (rows: readonly WebhookDeliveryDocument[]): Promise<void> => {
    const [group, rest] = [rows.slice(0, INLINE_CONCURRENCY), rows.slice(INLINE_CONCURRENCY)];
    if (group.length === 0) return Promise.resolve();

    return Promise.allSettled(group.map((delivery) => publishOrSend(delivery))).then((outcomes) => {
        const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length;
        if (failed > 0)
            logger.error({
                message: 'webhooks: a swept delivery failed',
                failed,
                of: group.length
            });
        return handleInGroups(rest);
    });
};

/**
 * Handle every delivery due for a retry right now, plus every stranded lease — see
 * `repository.ts#findDue`. Idempotent: handling a row that is already being worked costs one
 * wasted message or no-op claim, never a duplicate delivery — the claim in `./attempt.ts` decides.
 */
export const sweepDueWebhookDeliveries = (): Promise<void> =>
    webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT).then((due) => {
        // Stryker disable next-line all
        logger.info({ message: 'webhooks: sweeping due retries', count: due.length });
        return handleInGroups(due);
    });
