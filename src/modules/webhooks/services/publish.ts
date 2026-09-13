/**
 * @module
 * The domain-event subscriber: reacts to the six order/payment events over the kernel's bus — no
 * import from `webhooks` into `orders`/`payments`, the reverse edge is a domain event, exactly as
 * `docs/modules/webhooks.md` describes — matches each against
 * every enabled subscription's filter, and fans out: one delivery row plus one queue message per
 * match. `subscribeToWebhookEvents` runs once, from `../module.ts`'s `subscribe()` hook.
 *
 * The queue publish is fire-and-forget from here on purpose: when it fails (no broker configured,
 * or a publish error), the row it already wrote stays `pending` and `ops/sweep-webhook-retries.ts`
 * picks it up on its next pass — never lost, at worst delayed to the sweep interval. That is the
 * same "degrades to queued rather than to lost" story the delayed-retry decision
 * already accepts for a mid-chain retry, just reached one step earlier.
 */

import { randomUUID } from 'node:crypto';
import { onDomainEvent } from '@kernel/events';
import { ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_CANCELLED } from '@modules/orders';
import { PAYMENT_SUCCEEDED, PAYMENT_FAILED } from '@modules/payments';
import { publishToQueue } from '@infrastructure/adapters/queue';
import { logger } from '@infrastructure/adapters/logger';
import { WORKER_CHANNELS } from '@types';
import type { WebhookDeliverJobPayload } from '@types';
import { webhookSubscriptionRepository, webhookDeliveryRepository } from '../repository';
import { matchesEventFilter } from '../domain';
import type { WebhookDeliveryDocument, WebhookSubscriptionDocument } from '../model';

/** One public event, ready to fan out — the shape every domain-event listener below builds. */
interface PublicEvent {
    eventType: string;
    data: Record<string, unknown>;
}

/** Create the delivery row for one matching subscription. `attempt` always starts at 1. */
const createDeliveryRow = (
    subscription: WebhookSubscriptionDocument,
    event: PublicEvent,
    eventId: string
): Promise<WebhookDeliveryDocument> =>
    webhookDeliveryRepository.create({
        tenant: subscription.tenant,
        subscriptionId: subscription._id,
        eventId,
        eventType: event.eventType,
        payload: event.data,
        attempt: 1,
        status: 'pending',
        nextAttemptAt: new Date()
    });

/** Enqueue the fast-path delivery attempt for a just-created row. */
const enqueueAttempt = (
    subscription: WebhookSubscriptionDocument,
    event: PublicEvent,
    eventId: string,
    delivery: WebhookDeliveryDocument
): Promise<void> => {
    const payload: WebhookDeliverJobPayload = {
        deliveryId: String(delivery._id),
        subscriptionId: String(subscription._id),
        eventId,
        eventType: event.eventType,
        occurredAt: delivery.createdAt.toISOString(),
        data: event.data,
        attempt: 1
    };

    return publishToQueue<WebhookDeliverJobPayload>({
        queue: WORKER_CHANNELS.WEBHOOK_DELIVER,
        payload
    }).then(() => undefined);
};

/** Write the delivery row and enqueue its first attempt, for one matching subscription. */
const deliverToOne = (
    subscription: WebhookSubscriptionDocument,
    event: PublicEvent,
    eventId: string
): Promise<void> =>
    createDeliveryRow(subscription, event, eventId)
        .then((delivery) => enqueueAttempt(subscription, event, eventId, delivery))
        .catch((error: unknown) => {
            // One subscription's write failing must not stop the others matching the same event —
            // caught per subscription, same reasoning as `emitDomainEvent`'s own per-handler catch.
            logger.error({
                message: 'webhooks: failed to fan out to a subscription',
                subscriptionId: String(subscription._id),
                error: error instanceof Error ? error.message : String(error)
            });
        });

/**
 * Match `event` against every enabled subscription and fan out, sharing ONE `eventId` across every
 * match — the id a consumer dedupes `webhook-id` on, per Standard Webhooks, across both retries of
 * one delivery and the several subscriptions one event fans out to.
 */
const fanOut = (event: PublicEvent): Promise<void> => {
    const eventId = randomUUID();

    return webhookSubscriptionRepository.findEnabled().then((subscriptions) => {
        const matches = subscriptions.filter((subscription) =>
            matchesEventFilter(event.eventType, subscription.eventTypes)
        );
        return Promise.all(
            matches.map((subscription) => deliverToOne(subscription, event, eventId))
        ).then(() => undefined);
    });
};

/**
 * Registers this module's five domain-event listeners — the six public events, `order.paid` and
 * `order.shipped` both derived from `order.status_changed` filtered on `to` (see `orders/events.ts`:
 * "listeners filter on `to`; the event doesn't know who cares").
 */
export const subscribeToWebhookEvents = (): void => {
    onDomainEvent(ORDER_CREATED, ({ orderId }) =>
        fanOut({ eventType: 'order.created', data: { orderId } })
    );

    onDomainEvent(ORDER_STATUS_CHANGED, ({ orderId, to }) => {
        if (to === 'paid') return fanOut({ eventType: 'order.paid', data: { orderId } });
        if (to === 'shipped') return fanOut({ eventType: 'order.shipped', data: { orderId } });
        return undefined;
    });

    onDomainEvent(ORDER_CANCELLED, ({ orderId, refund }) =>
        fanOut({ eventType: 'order.cancelled', data: { orderId, refund } })
    );

    onDomainEvent(PAYMENT_SUCCEEDED, ({ paymentId, orderId }) =>
        fanOut({ eventType: 'payment.succeeded', data: { paymentId, orderId } })
    );

    onDomainEvent(PAYMENT_FAILED, ({ paymentId, orderId }) =>
        fanOut({ eventType: 'payment.failed', data: { paymentId, orderId } })
    );
};
