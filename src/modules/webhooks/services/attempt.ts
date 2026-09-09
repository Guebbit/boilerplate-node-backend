/**
 * @module
 * The core delivery attempt: sign, SSRF-check, POST (`@infrastructure/adapters/webhook-delivery`),
 * then record the outcome on the delivery row and the subscription's failure streak. Shared by the
 * worker resolver (`../module.ts`, queued attempts) and `replay` (`./deliveries.ts`, a synchronous
 * admin re-send) so the two paths cannot drift on what "recording an outcome" means.
 */

import { deliverWebhook } from '@infrastructure/adapters/webhook-delivery';
import type { WebhookDeliverJobPayload } from '@types';
import { webhookSubscriptionRepository, webhookDeliveryRepository } from '../repository';
import { activeRingSecrets } from '../secrets';
import { nextAttemptAt, shouldAutoDisable } from '../domain';
import type { WebhookDeliveryDocument, WebhookSubscriptionDocument } from '../model';

/**
 * Finalize a claimed delivery with nothing to attempt it against — its subscription was deleted
 * since the job was queued, or is disabled. Terminal either way: no subscription is left to retry.
 */
const finalizeUndeliverable = (
    delivery: WebhookDeliveryDocument,
    error: string
): Promise<WebhookDeliveryDocument> => {
    delivery.status = 'exhausted';
    delivery.error = error;
    return webhookDeliveryRepository.save(delivery);
};

/** Record a successful attempt: the row succeeds, and the subscription's failure streak resets. */
const recordSuccess = (
    delivery: WebhookDeliveryDocument,
    responseCode: number | undefined,
    durationMs: number
): Promise<WebhookDeliveryDocument> => {
    delivery.status = 'succeeded';
    delivery.responseCode = responseCode;
    delivery.durationMs = durationMs;
    delivery.error = undefined;
    return webhookDeliveryRepository
        .save(delivery)
        .then((saved) =>
            webhookSubscriptionRepository
                .recordOutcome(String(delivery.subscriptionId), true)
                .then(() => saved)
        );
};

/**
 * Record a failed attempt: schedule the next retry if the backoff ladder has one left, otherwise
 * mark the chain `exhausted` and count it against the subscription's consecutive-failure streak —
 * auto-disabling once {@link shouldAutoDisable} says the streak is long enough.
 */
const recordFailure = (
    delivery: WebhookDeliveryDocument,
    responseCode: number | undefined,
    durationMs: number,
    error: string | undefined
): Promise<WebhookDeliveryDocument> => {
    const subscriptionId = String(delivery.subscriptionId);
    const retryAt = nextAttemptAt(delivery.attempt);

    if (retryAt) {
        delivery.status = 'pending';
        delivery.attempt += 1;
        delivery.responseCode = responseCode;
        delivery.durationMs = durationMs;
        delivery.error = error;
        delivery.nextAttemptAt = retryAt;
        // Left as `pending` for the sweep (or a fast retry, if one ever exists) to pick up —
        // no subscription write here: only a whole EXHAUSTED chain counts as a failure, per
        // reading of "sustained failure" as a whole chain giving up, not a single failed attempt.
        return webhookDeliveryRepository.save(delivery);
    }

    delivery.status = 'exhausted';
    delivery.responseCode = responseCode;
    delivery.durationMs = durationMs;
    delivery.error = error;

    return webhookDeliveryRepository.save(delivery).then((saved) =>
        webhookSubscriptionRepository.recordOutcome(subscriptionId, false).then((updated) => {
            if (updated && shouldAutoDisable(updated.consecutiveFailures))
                return webhookSubscriptionRepository.disable(subscriptionId).then(() => saved);
            return saved;
        })
    );
};

/**
 * Attempt one delivery: sign and POST against `subscription`'s CURRENT url and ring, then record
 * the outcome on `delivery`. Caller-supplied `subscription` (rather than re-fetched here) is what
 * lets `replay` and {@link processDeliveryJob} share this function despite loading it
 * differently — `processDeliveryJob` already fetched it to decide whether there is anything to send.
 */
export const attemptDelivery = (
    delivery: WebhookDeliveryDocument,
    subscription: WebhookSubscriptionDocument
): Promise<WebhookDeliveryDocument> => {
    if (!subscription.enabled) return finalizeUndeliverable(delivery, 'Subscription is disabled');

    const secrets = activeRingSecrets(subscription.secrets);
    if (secrets.length === 0)
        return finalizeUndeliverable(delivery, 'Subscription has no active secret');

    return deliverWebhook({
        url: subscription.url,
        secrets,
        eventId: delivery.eventId,
        payload: delivery.payload
    }).then((result) =>
        result.success
            ? recordSuccess(delivery, result.statusCode, result.durationMs)
            : recordFailure(delivery, result.statusCode, result.durationMs, result.error)
    );
};

/** `attemptDelivery`, widened to a possibly-missing subscription — see {@link processDeliveryJob}. */
const deliverIfPossible = (
    delivery: WebhookDeliveryDocument,
    subscription: WebhookSubscriptionDocument | null
): Promise<WebhookDeliveryDocument> =>
    subscription
        ? attemptDelivery(delivery, subscription)
        : finalizeUndeliverable(delivery, 'Subscription no longer exists');

/**
 * Process one `worker.webhook.deliver` job: claim the row it names, load its subscription, and
 * attempt it. This is the function `../module.ts` registers with the infra worker
 * (`@infrastructure/adapters/webhook.worker.ts`) at import time, the same shape
 * `registerAuditSink`/`registerImageWritebackResolver` already establish for "infra needs a
 * module's data and cannot import the module to get it".
 *
 * @returns `true` (ack) once the row is claimed and settled, or when it was already claimed by a
 *   sibling (the sweep, or a redelivered duplicate) — nothing left for this delivery to do. A
 *   thrown/rejected write is left to reject, so `consumeFromQueue` requeues it as transient.
 */
export const processDeliveryJob = (payload: WebhookDeliverJobPayload): Promise<boolean> =>
    webhookDeliveryRepository.claimPending(payload.deliveryId).then((delivery) => {
        if (!delivery) return true;

        return webhookSubscriptionRepository
            .findById(String(delivery.subscriptionId))
            .then((subscription) => deliverIfPossible(delivery, subscription))
            .then(() => true);
    });
