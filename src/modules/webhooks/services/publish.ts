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
 * picks it up on its next pass. With a broker the sweep re-publishes it; without one the sweep
 * sends it itself (`./sweep.ts`) — never lost, at worst delayed to the sweep interval. That is
 * the same "degrades to queued rather than to lost" story `./attempt.ts`'s `recordFailure` already
 * accepts for a mid-chain retry, just reached one step earlier.
 */

import { randomUUID } from 'node:crypto';
import { onDomainEvent, type DomainEventName } from '@kernel/events';
import type { PublicEventProjection, PublicEventTarget } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { webhookSubscriptionRepository, webhookDeliveryRepository } from '../repository';
import { matchesEventFilter } from '../domain';
import type { WebhookDeliveryDocument, WebhookSubscriptionDocument } from '../model';
import { enqueueDeliveryAttempt } from './enqueue';

/**
 * Create the delivery row for one matching subscription. `attempt` always starts at 1.
 *
 * Idempotent on `(subscriptionId, eventId)`: the outbox relay is at-least-once, so the same event
 * can arrive twice, and the unique index turns the second arrival into `null` — "this
 * subscription already has its row" — instead of a duplicate delivery.
 */
const createDeliveryRow = (
    subscription: WebhookSubscriptionDocument,
    event: PublicEventProjection,
    eventId: string
): Promise<WebhookDeliveryDocument | null> =>
    webhookDeliveryRepository
        .create({
            tenant: subscription.tenant,
            subscriptionId: subscription._id,
            eventId,
            eventType: event.eventType,
            payload: event.data,
            attempt: 1,
            status: 'pending',
            nextAttemptAt: new Date()
        })
        .catch((error: unknown) => {
            if (isDuplicateKey(error)) return null;
            throw error;
        });

/**
 * Write the delivery row and enqueue its first attempt, for one matching subscription.
 *
 * Rejects on failure: the caller decides what a failed subscription means. A row that already
 * existed is not a failure and enqueues nothing — its first attempt was enqueued (or is waiting
 * for the retry sweep) by whoever created it.
 */
const deliverToOne = (
    subscription: WebhookSubscriptionDocument,
    event: PublicEventProjection,
    eventId: string
): Promise<void> =>
    createDeliveryRow(subscription, event, eventId).then((delivery) =>
        delivery ? enqueueDeliveryAttempt(delivery).then(() => undefined) : undefined
    );

/**
 * Match `event` against every enabled subscription and fan out, sharing ONE `eventId` across every
 * match — the id a consumer dedupes `webhook-id` on, per Standard Webhooks, across both retries of
 * one delivery and the several subscriptions one event fans out to.
 *
 * `eventId` is the outbox row's id when the event came through the outbox, so a redelivered event
 * keeps its id and `createDeliveryRow` recognises it; a plain in-process emit has none and gets a
 * fresh one.
 *
 * Every matching subscription is attempted even when one fails (`allSettled`), and the failures
 * are then thrown together: the event bus reports `false` and the outbox retries, while the
 * subscriptions that already have their row are skipped on that retry.
 */
const fanOut = (event: PublicEventProjection, eventId: string = randomUUID()): Promise<void> =>
    webhookSubscriptionRepository.findEnabled().then((subscriptions) => {
        const matches = subscriptions.filter((subscription) =>
            matchesEventFilter(event.eventType, subscription.eventTypes)
        );
        return Promise.allSettled(
            matches.map((subscription) => deliverToOne(subscription, event, eventId))
        ).then((outcomes) => {
            const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
            // Stryker disable next-line all
            if (failures.length > 0)
                logger.error({
                    message: 'webhooks: failed to fan out to a subscription',
                    failed: failures.length,
                    of: matches.length
                });
            if (failures.length > 0)
                throw new Error(`webhooks: ${String(failures.length)} fan-out(s) failed`);
        });
    });

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

    onDomainEvent(domainEventName as DomainEventName, (payload, meta) => {
        const publicEvent = toPublicEvent(payload);
        return publicEvent ? fanOut(publicEvent, meta.eventId) : undefined;
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
