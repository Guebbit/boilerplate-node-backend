/**
 * @module
 * The domain-event subscriber: reacts to every domain event a registered module's manifest names
 * a {@link PublicEventTarget} for (`kernel/registry.ts`'s `resolvePublicEvents`) — no import from
 * `webhooks` into `orders`/`payments`, the reverse edge is a domain event, exactly as
 * `docs/modules/webhooks.md` describes — matches each projected public event against every enabled
 * subscription's filter, and fans out: one delivery row plus one queue message per match.
 * `subscribeToWebhookEvents` runs once, from `../module.ts`'s `onRegistered` hook, once every
 * module — and therefore its `publicEvents` — is known.
 *
 * The queue publish is fire-and-forget from here on purpose: when it fails (no broker configured,
 * or a publish error), the row it already wrote stays `pending` and `scripts/ops/sweep-webhook-retries.ts`
 * picks it up on its next pass — never lost, at worst delayed to the sweep interval. That is the
 * same "degrades to queued rather than to lost" story `./attempt.ts`'s `recordFailure` already
 * accepts for a mid-chain retry, just reached one step earlier.
 */

import { randomUUID } from 'node:crypto';
import { onDomainEvent, type DomainEventName } from '@kernel/events';
import type { PublicEventProjection, PublicEventTarget } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { webhookSubscriptionRepository, webhookDeliveryRepository } from '../repository';
import { matchesEventFilter } from '../domain';
import type { WebhookDeliveryDocument, WebhookSubscriptionDocument } from '../model';
import { enqueueDeliveryAttempt } from './enqueue';

/** Create the delivery row for one matching subscription. `attempt` always starts at 1. */
const createDeliveryRow = (
    subscription: WebhookSubscriptionDocument,
    event: PublicEventProjection,
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

/** Write the delivery row and enqueue its first attempt, for one matching subscription. */
const deliverToOne = (
    subscription: WebhookSubscriptionDocument,
    event: PublicEventProjection,
    eventId: string
): Promise<void> =>
    createDeliveryRow(subscription, event, eventId)
        .then((delivery) => enqueueDeliveryAttempt(delivery))
        .catch((error: unknown) => {
            // One subscription's write failing must not stop the others matching the same event —
            // caught per subscription, same reasoning as `emitDomainEvent`'s own per-handler catch.
            // Stryker disable all
            logger.error({
                message: 'webhooks: failed to fan out to a subscription',
                subscriptionId: String(subscription._id),
                error
            });
            // Stryker restore all
        });

/**
 * Match `event` against every enabled subscription and fan out, sharing ONE `eventId` across every
 * match — the id a consumer dedupes `webhook-id` on, per Standard Webhooks, across both retries of
 * one delivery and the several subscriptions one event fans out to.
 */
const fanOut = (event: PublicEventProjection): Promise<void> => {
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
 * One domain-event listener for one {@link PublicEventTarget}: project the payload, and fan out
 * only when the projection actually names a public event — `target.toPublicEvent` answers
 * `undefined` for a payload that isn't one, `order.status_changed` outside `to: 'paid'`/`'shipped'`
 * being the only case that happens today.
 *
 * Two casts, both narrowing something the compiler genuinely cannot see, not laundering `any`:
 * `domainEventName` is a real `DomainEventName` because it came off a module's own manifest at
 * boot (`kernel/registry.ts`'s `resolvePublicEvents`), just not a compile-time literal; `target`'s
 * `toPublicEvent` is stored as `(payload: never) => …` because ONE lookup holds every module's
 * target, so it is cast back to a callable taking whatever `onDomainEvent` actually hands this
 * listener — the same trick `kernel/events.ts`'s own `handler as DomainEventHandler<TEventName>`
 * plays, the other direction.
 */
const subscribeToTarget = (domainEventName: string, target: PublicEventTarget): void => {
    const toPublicEvent = target.toPublicEvent as (
        payload: unknown
    ) => PublicEventProjection | undefined;

    onDomainEvent(domainEventName as DomainEventName, (payload) => {
        const publicEvent = toPublicEvent(payload);
        return publicEvent ? fanOut(publicEvent) : undefined;
    });
};

/**
 * Registers one domain-event listener per {@link PublicEventTarget} every enabled module declared
 * — no import from `webhooks` into `orders`/`payments` to know which events exist, only the
 * lookup `../module.ts`'s `onRegistered` hook already resolved.
 *
 * @param publicEvents - every registered module's domain-event → public-event mapping, keyed by
 *   domain event name (`kernel/registry.ts`'s `resolvePublicEvents`)
 */
export const subscribeToWebhookEvents = (
    publicEvents: Readonly<Record<string, PublicEventTarget | undefined>>
): void => {
    for (const [domainEventName, target] of Object.entries(publicEvents))
        if (target) subscribeToTarget(domainEventName, target);
};
