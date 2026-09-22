/**
 * @module
 * The core delivery attempt: sign, SSRF-check, POST (`../transport/webhook-delivery`), then record
 * the outcome on the delivery row and the subscription's failure streak. Shared by
 * {@link processDeliveryJob} below (queued attempts, registered on `../module.ts`'s `consumers`
 * manifest entry) and `replay` (`./deliveries.ts`, a synchronous admin re-send) so the two paths
 * cannot drift on what "recording an outcome" means.
 *
 * `attemptDelivery` takes an ALREADY-CLAIMED row — `delivery.leaseToken` must be set, from
 * `repository.ts`'s `claimPending` or `claimForReplay`. Every outcome write goes through
 * `applyOutcome`, which only applies while that token still matches; see `../model.ts`'s
 * `leaseToken` docblock for why. A write that loses the race (`applyOutcome` returns `null`) is
 * dropped, never retried — whatever re-claimed the row in the meantime owns its outcome now.
 */

import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { getDefaultLocale } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { emitAuditEvent } from '@infrastructure/observability/audit';
import type { AuditEvent } from '@infrastructure/observability/audit';
import { userService } from '@modules/users';
import { deliverWebhook } from '../transport/webhook-delivery';
import type { WebhookDeliverJobPayload } from '@types';
import { webhookSubscriptionRepository, webhookDeliveryRepository } from '../repository';
import { activeRingSecrets } from '../secrets';
import { getWebhookDemoAllowedHost } from '../config';
import { nextAttemptAt, shouldAutoDisable } from '../domain';
import { subscriptionDisabledEmail } from '../emails';
import { webhooksAuditActions } from '../audit';
import { webhookDeliveryAttemptsTotal, webhookSubscriptionsAutoDisabledTotal } from '../metrics';
import type { WebhookDeliveryDocument, WebhookSubscriptionDocument } from '../model';

/**
 * Tell whoever created a subscription that it was just auto-disabled — best-effort, fire-and-
 * forget the same way every other queued notification in this codebase is (see
 * `orders/services/crud.ts`'s own confirmation-mail call for the precedent). A no-op when
 * `disable` found nothing to disable (a second exhausted chain finalizing moments later — see
 * `repository.ts#disable`'s own conditional write).
 *
 * Deliberately NOT the operator-facing alert (`QueueJobsParked`) — that is Alertmanager's job, for
 * a different audience; this is the one person who configured THIS endpoint hearing about it. The
 * email address is resolved fresh from `ownerUserId` here, never stored on the subscription — see
 * `../model.ts`'s own field docblock for why. The audit entry lands regardless of whether an email
 * could be sent (no `ownerUserId` at all, or its user no longer resolves); the email is the
 * courtesy, the audit trail is the record.
 */
const notifyOwnerOfAutoDisable = (subscription: WebhookSubscriptionDocument | null): void => {
    if (!subscription) return;

    // No `CallerContext` behind this — see `../audit.ts`'s own note on why `actor_user_id` is the
    // literal string `'system'` rather than attributing it to whichever worker process ran this.
    emitAuditEvent({
        actor_user_id: 'system',
        actor_role: 'admin',
        actor_scope: 'tenant',
        action: webhooksAuditActions.SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED,
        outcome: 'success',
        target_type: 'webhook_subscription',
        target_id: String(subscription._id)
    } satisfies AuditEvent);

    void userService
        .getById(subscription.ownerUserId)
        .then((owner) => {
            if (!owner) return;
            const mail = subscriptionDisabledEmail(getDefaultLocale(), subscription.url);
            void enqueueEmail({ to: owner.email, subject: mail.subject }, mail.template, mail.data);
        })
        .catch((error: unknown) => {
            // The audit entry above already recorded the disable — a failed lookup here only
            // costs the courtesy email, not the fact of it. Logged so the miss is visible instead
            // of surfacing as an unhandled rejection with nothing left to tie it back to this
            // subscription.
            logger.error({
                message: 'Could not notify the subscription owner of an auto-disable.',
                subscriptionId: String(subscription._id),
                error
            });
        });
};

/**
 * `applyOutcome` requires a lease token; every caller here only ever holds an ALREADY-CLAIMED row
 * (see the module docblock), where `claimPending`/`claimForReplay` always stamp one — the optional
 * type on `WebhookDeliveryDocument.leaseToken` describes a row that was never claimed at all, not
 * this one. Narrowing here, once, is what lets `applyOutcome` itself demand a real `string` rather
 * than silently accepting `undefined` and matching a never-claimed row.
 *
 * @throws {Error} only were this ever called on an unclaimed row — a bug upstream, not a
 *   reachable production state
 */
const requireLeaseToken = (delivery: WebhookDeliveryDocument): string => {
    if (!delivery.leaseToken)
        throw new Error(`Delivery ${String(delivery._id)} has no lease token to record against`);
    return delivery.leaseToken;
};

/**
 * Finalize a claimed delivery with nothing to attempt it against — its subscription was deleted
 * since the job was queued, or is disabled. Terminal either way: no subscription is left to retry.
 */
const finalizeUndeliverable = (
    delivery: WebhookDeliveryDocument,
    error: string
): Promise<WebhookDeliveryDocument | null> =>
    webhookDeliveryRepository.applyOutcome(String(delivery._id), requireLeaseToken(delivery), {
        status: 'exhausted',
        error
    });

/** Record a successful attempt: the row succeeds, and the subscription's failure streak resets. */
const recordSuccess = (
    delivery: WebhookDeliveryDocument,
    responseCode: number | undefined,
    durationMs: number
): Promise<WebhookDeliveryDocument | null> => {
    webhookDeliveryAttemptsTotal.inc({ outcome: 'success' });

    return webhookDeliveryRepository
        .applyOutcome(String(delivery._id), requireLeaseToken(delivery), {
            status: 'succeeded',
            responseCode,
            durationMs,
            error: undefined
        })
        .then((saved) =>
            saved
                ? webhookSubscriptionRepository
                      .recordOutcome(String(delivery.subscriptionId), true)
                      .then(() => saved)
                : null
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
): Promise<WebhookDeliveryDocument | null> => {
    webhookDeliveryAttemptsTotal.inc({ outcome: 'failure' });

    const subscriptionId = String(delivery.subscriptionId);
    const retryAt = nextAttemptAt(delivery.attempt);
    const leaseToken = requireLeaseToken(delivery);

    if (retryAt) {
        // Left as `pending` for the sweep (or a fast retry, if one ever exists) to pick up —
        // no subscription write here: only a whole EXHAUSTED chain counts as a failure, per
        // reading of "sustained failure" as a whole chain giving up, not a single failed attempt.
        return webhookDeliveryRepository.applyOutcome(String(delivery._id), leaseToken, {
            status: 'pending',
            attempt: delivery.attempt + 1,
            responseCode,
            durationMs,
            error,
            nextAttemptAt: retryAt
        });
    }

    return webhookDeliveryRepository
        .applyOutcome(String(delivery._id), leaseToken, {
            status: 'exhausted',
            responseCode,
            durationMs,
            error
        })
        .then((saved) => {
            if (!saved) return null;
            return webhookSubscriptionRepository
                .recordOutcome(subscriptionId, false)
                .then((updated) => {
                    if (
                        updated &&
                        shouldAutoDisable(updated.consecutiveFailures, updated.failingSince)
                    )
                        return webhookSubscriptionRepository
                            .disable(subscriptionId)
                            .then((disabled) => {
                                if (disabled) webhookSubscriptionsAutoDisabledTotal.inc();
                                notifyOwnerOfAutoDisable(disabled);
                                return saved;
                            });
                    return saved;
                });
        });
};

/**
 * Attempt one delivery: sign and POST against `subscription`'s CURRENT url and ring, then record
 * the outcome on `delivery`. Caller-supplied `subscription` (rather than re-fetched here) is what
 * lets `replay` and {@link processDeliveryJob} share this function despite loading it
 * differently — `processDeliveryJob` already fetched it to decide whether there is anything to send.
 *
 * @param delivery - an ALREADY-CLAIMED row (`delivery.leaseToken` set) — see the module docblock
 * @returns the row as it stands after the outcome, or `null` if the claim was lost mid-attempt
 *   (`applyOutcome` found a different token) — vanishingly rare given the lease's margin over the
 *   HTTP timeout, but a real possibility under a serious stall, not a bug to paper over
 */
export const attemptDelivery = (
    delivery: WebhookDeliveryDocument,
    subscription: WebhookSubscriptionDocument
): Promise<WebhookDeliveryDocument | null> => {
    if (!subscription.enabled) return finalizeUndeliverable(delivery, 'Subscription is disabled');

    const secrets = activeRingSecrets(subscription.secrets);
    if (secrets.length === 0)
        return finalizeUndeliverable(delivery, 'Subscription has no active secret');

    return deliverWebhook({
        url: subscription.url,
        secrets,
        eventId: delivery.eventId,
        // The Standard Webhooks envelope: `type` lets a subscriber on more than one event tell
        // them apart without inspecting `data`'s shape; `timestamp` is `delivery.createdAt` (when
        // the event occurred) rather than `Date.now()`, so it stays identical across every retry
        // of the same delivery — see `../asyncapi.yaml`'s own header for the full shape.
        payload: {
            type: delivery.eventType,
            timestamp: delivery.createdAt.toISOString(),
            data: delivery.payload
        },
        // `undefined` outside development/test, or with no sink configured — see the SSRF
        // guard's own docblock for what this one exemption does and does not relax.
        allowedInsecureHost: getWebhookDemoAllowedHost()
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
): Promise<WebhookDeliveryDocument | null> =>
    subscription
        ? attemptDelivery(delivery, subscription)
        : finalizeUndeliverable(delivery, 'Subscription no longer exists');

/**
 * Process one `worker.webhook.deliver` job: claim the row it names, load its subscription, and
 * attempt it. This is the handler `../module.ts` declares on its `consumers` manifest entry —
 * `app/workers.ts` is what actually calls `consumeFromQueue` with it, once per enabled module's
 * consumer list, so deleting this module is enough to stop the queue meaning anything.
 *
 * @returns `true` (ack) once the row is claimed and settled, or when it was already claimed by a
 *   sibling (a live worker's lease, or a row already resolved) — nothing left for this delivery to
 *   do. A thrown/rejected write is left to reject, so `consumeFromQueue` requeues it as transient.
 */
export const processDeliveryJob = (payload: WebhookDeliverJobPayload): Promise<boolean> =>
    webhookDeliveryRepository.claimPending(payload.deliveryId).then((delivery) => {
        if (!delivery) return true;

        return webhookSubscriptionRepository
            .findById(String(delivery.subscriptionId))
            .then((subscription) => deliverIfPossible(delivery, subscription))
            .then(() => true);
    });
