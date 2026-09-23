/**
 * @module
 * The retry sweep: publish every delivery due for another attempt, plus any stranded `in-flight`
 * row whose lease already expired (`scripts/ops/sweep-webhook-retries.ts` runs
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
import { webhookDeliveryRepository } from '../repository';
import { enqueueDeliveryAttempt } from './enqueue';

/** The ceiling one sweep run enqueues, so a very late sweep cannot burst-publish an unbounded batch. */
const SWEEP_BATCH_LIMIT = 200;

/**
 * Enqueue every delivery due for a retry right now, plus every stranded lease — see
 * `repository.ts#findDue`. Idempotent: publishing a row that is already being worked costs one
 * wasted message, never a duplicate delivery — the claim in `./attempt.ts` is what actually decides.
 */
export const sweepDueWebhookDeliveries = (): Promise<void> =>
    webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT).then((due) => {
        // Stryker disable next-line all
        logger.info({ message: 'webhooks: sweeping due retries', count: due.length });
        return Promise.all(due.map((delivery) => enqueueDeliveryAttempt(delivery))).then(
            () => undefined
        );
    });
