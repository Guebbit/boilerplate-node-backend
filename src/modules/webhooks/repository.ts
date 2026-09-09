/**
 * @module
 * Repositories for both collections, plus the two queries the generic factory has no shape for:
 * the sweep's atomic claim, and finding every enabled subscription an event might match.
 */

import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import {
    webhookSubscriptionModel,
    applyWebhookSubscriptionTransform,
    webhookDeliveryModel,
    applyWebhookDeliveryTransform,
    type WebhookSubscriptionDocument,
    type WebhookDeliveryDocument
} from './model';

/** The shared factory's CRUD, scoped to `webhooksubscriptions`. No `searchable`: the admin list has no filters. */
const subscriptionBase = createRepository<WebhookSubscriptionDocument>(webhookSubscriptionModel, {
    transform: applyWebhookSubscriptionTransform
});

/**
 * Every ENABLED subscription — the whole small table, read once per published event and matched
 * in memory by `domain/event-filter.ts`. A collection-scan `find` rather than an event-type index:
 * this table is expected to stay small (a cap on subscriptions per tenant is the doc's own fan-out
 * guard), and an index on a field matched by set-membership/wildcard logic can't help Mongo anyway.
 */
const findEnabled = (): Promise<WebhookSubscriptionDocument[]> =>
    webhookSubscriptionModel.find({ enabled: true }).exec();

/**
 * Record one delivery chain's final outcome against its subscription — `$set` to zero on success,
 * `$inc` on exhaustion. Atomic so two events finalizing for the same subscription in the same
 * instant cannot lose one another's count, the way a read-then-write would.
 *
 * @param subscriptionId - the subscription the finished delivery belonged to
 * @param succeeded - whether the chain ended in a success
 * @returns the subscription as it stands after the write, or `null` if it was deleted meanwhile
 */
const recordOutcome = (
    subscriptionId: string,
    succeeded: boolean
): Promise<WebhookSubscriptionDocument | null> =>
    webhookSubscriptionModel
        .findOneAndUpdate(
            { _id: toObjectId(subscriptionId) },
            succeeded ? { $set: { consecutiveFailures: 0 } } : { $inc: { consecutiveFailures: 1 } },
            { returnDocument: 'after' }
        )
        .exec();

/**
 * Turn an enabled, over-threshold subscription off. Conditional on `enabled: true` so a second
 * exhausted delivery finalizing moments later cannot re-stamp `disabledAt` over the real one.
 */
const disable = (subscriptionId: string): Promise<WebhookSubscriptionDocument | null> =>
    webhookSubscriptionModel
        .findOneAndUpdate(
            { _id: toObjectId(subscriptionId), enabled: true },
            { $set: { enabled: false, disabledAt: new Date() } },
            { returnDocument: 'after' }
        )
        .exec();

/*
 * Explicit annotation, not inferred: Mongoose's `Query` generics are large enough that TypeScript
 * refuses to serialize the inferred shape at this export boundary (TS7056) once the factory result
 * is spread into a repository object — see `create-repository.ts`'s own `Repository<TDocument>`
 * docblock for why naming the contract is what fixes it.
 */
export const webhookSubscriptionRepository: Repository<WebhookSubscriptionDocument> & {
    findEnabled: typeof findEnabled;
    recordOutcome: typeof recordOutcome;
    disable: typeof disable;
} = {
    ...subscriptionBase,
    findEnabled,
    recordOutcome,
    disable
};

/** The shared factory's CRUD, scoped to `webhookdeliveries`. */
const deliveryBase = createRepository<WebhookDeliveryDocument>(webhookDeliveryModel, {
    transform: applyWebhookDeliveryTransform,
    searchable: {
        objectIds: { subscription: 'subscriptionId' },
        exact: { status: 'status', eventType: 'eventType' }
    }
});

/** Newest first, `_id` breaking ties — same reasoning as `AUDIT_SORT`. */
export const WEBHOOK_DELIVERY_SORT: Record<string, 1 | -1> = { createdAt: -1, _id: -1 };

/**
 * Atomically claim ONE due delivery: `pending` → `in-flight`, only if it is still `pending`.
 *
 * The conditional filter is the whole mechanism — two callers racing this row (the sweep and a
 * fast-path worker that has not yet run) can both issue this write, and exactly one matches.
 * `findOneAndUpdate` rather than `find` + `updateOne`: the read and the write must be one atomic
 * step, or the race this exists to prevent just moves earlier.
 *
 * @param id - the delivery row to claim
 * @returns the claimed, now-`in-flight` document, or `null` if it was already claimed or resolved
 */
const claimPending = (id: string): Promise<WebhookDeliveryDocument | null> =>
    webhookDeliveryModel
        .findOneAndUpdate(
            { _id: toObjectId(id), status: 'pending' },
            { $set: { status: 'in-flight' } },
            { returnDocument: 'after' }
        )
        .exec();

/**
 * Every delivery row due for an attempt right now, oldest first — the sweep's own read.
 *
 * Unclaimed on purpose: the sweep calls {@link claimPending} per row so a row already picked up by
 * the fast path (still `pending` here because the worker hasn't reached its own claim yet, or
 * already `in-flight` because it has) is handled by that one atomic step rather than by a second
 * query racing this one.
 *
 * @param limit - the ceiling per sweep run, so one very late sweep does not enqueue an unbounded burst
 */
const findDue = (limit: number): Promise<WebhookDeliveryDocument[]> =>
    webhookDeliveryModel
        .find({ status: 'pending', nextAttemptAt: { $lte: new Date() } })
        .sort({ nextAttemptAt: 1 })
        .limit(limit)
        .exec();

/** Every attempt row for one event, oldest first — what `POST /webhooks/deliveries/{id}/replay` reads to build the next attempt number. */
const findByEventId = (eventId: string): Promise<WebhookDeliveryDocument[]> =>
    webhookDeliveryModel.find({ eventId }).sort({ attempt: 1 }).exec();

/** Explicit annotation for the same TS7056 reason as {@link webhookSubscriptionRepository}. */
export const webhookDeliveryRepository: Repository<WebhookDeliveryDocument> & {
    claimPending: typeof claimPending;
    findDue: typeof findDue;
    findByEventId: typeof findByEventId;
} = {
    ...deliveryBase,
    claimPending,
    findDue,
    findByEventId
};
