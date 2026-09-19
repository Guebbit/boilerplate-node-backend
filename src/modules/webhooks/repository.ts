/**
 * @module
 * Repositories for both collections, plus the queries the generic factory has no shape for: the
 * queued/sweep and admin-replay atomic claims (`claimPending`, `claimForReplay`), and finding
 * every enabled subscription an event might match.
 */

import { randomUUID } from 'node:crypto';
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
 * Record a chain's failure: `$inc` the streak (atomic, so two events finalizing for the same
 * subscription in the same instant cannot lose one another's count, the way a read-then-write
 * would), plus a SEPARATE write that stamps `failingSince` only the first time — the filter's
 * `failingSince: { $exists: false }` is what makes "first" atomic on its own, without needing an
 * aggregation-pipeline update to combine both into one round trip. Order matters: this runs BEFORE
 * the `$inc` below, so the value `recordOutcome` hands back already reflects it.
 */
const recordFailure = (subscriptionId: string): Promise<WebhookSubscriptionDocument | null> =>
    webhookSubscriptionModel
        .findOneAndUpdate(
            { _id: toObjectId(subscriptionId), failingSince: { $exists: false } },
            { $set: { failingSince: new Date() } }
        )
        .exec()
        .then(() =>
            webhookSubscriptionModel
                .findOneAndUpdate(
                    { _id: toObjectId(subscriptionId) },
                    { $inc: { consecutiveFailures: 1 } },
                    { returnDocument: 'after' }
                )
                .exec()
        );

/**
 * Record one delivery chain's final outcome against its subscription. Atomic on success (`$set`
 * resets the streak in one write); see {@link recordFailure} for why a failure takes two.
 *
 * @param subscriptionId - the subscription the finished delivery belonged to
 * @param succeeded - whether the chain ended in a success
 * @returns the subscription as it stands after the write, or `null` if it was deleted meanwhile
 */
const recordOutcome = (
    subscriptionId: string,
    succeeded: boolean
): Promise<WebhookSubscriptionDocument | null> =>
    succeeded
        ? webhookSubscriptionModel
              .findOneAndUpdate(
                  { _id: toObjectId(subscriptionId) },
                  { $set: { consecutiveFailures: 0 }, $unset: { failingSince: '' } },
                  { returnDocument: 'after' }
              )
              .exec()
        : recordFailure(subscriptionId);

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
 * Well above `transport/webhook-delivery.ts#DEFAULT_TIMEOUT_MS` (10s) — enough slack for the DB
 * round trip and a GC pause, not so much that a worker that genuinely crashed mid-attempt strands
 * its row for long before the sweep's stranded-lease read picks it up again.
 */
const LEASE_DURATION_MS = 60_000;

/** A fresh lease: who is claiming, and until when. */
const lease = (): { leaseToken: string; leaseExpiresAt: Date } => ({
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS)
});

/**
 * Atomically claim one row for exclusive work: `pending` → `in-flight`, or a STRANDED `in-flight`
 * row whose lease has already expired — a worker that crashed mid-attempt, or a sweep whose own
 * queue publish never arrived. The queued/sweep path's own claim; see {@link claimForReplay} for
 * the admin path, which may also reclaim a row already at a terminal status.
 *
 * `findOneAndUpdate` rather than `find` + `updateOne`: the read and the write must be one atomic
 * step, or the race this exists to prevent just moves earlier.
 *
 * @param id - the delivery row to claim
 * @returns the claimed row, now `in-flight` under a fresh lease (read `leaseToken` off it for
 *   {@link applyOutcome}), or `null` if it is claimed by a live lease or already resolved
 */
const claimPending = (id: string): Promise<WebhookDeliveryDocument | null> =>
    webhookDeliveryModel
        .findOneAndUpdate(
            {
                _id: toObjectId(id),
                $or: [
                    { status: 'pending' },
                    { status: 'in-flight', leaseExpiresAt: { $lt: new Date() } }
                ]
            },
            { $set: { status: 'in-flight', ...lease() } },
            { returnDocument: 'after' }
        )
        .exec();

/**
 * The admin replay's own claim — same exclusive lease as {@link claimPending}, but over ANY status
 * except a row under a live lease right now. Replay's whole point is re-sending a row that already
 * reached a terminal status (`succeeded`, `exhausted`), which {@link claimPending} would correctly
 * refuse to touch.
 *
 * @param id - the delivery row to claim
 * @returns the claimed row, or `null` only when a live worker or another replay holds the lease
 */
const claimForReplay = (id: string): Promise<WebhookDeliveryDocument | null> =>
    webhookDeliveryModel
        .findOneAndUpdate(
            {
                _id: toObjectId(id),
                $or: [{ status: { $ne: 'in-flight' } }, { leaseExpiresAt: { $lt: new Date() } }]
            },
            { $set: { status: 'in-flight', ...lease() } },
            { returnDocument: 'after' }
        )
        .exec();

/**
 * Apply an outcome patch to a delivery, but ONLY while `leaseToken` still matches the claim writing
 * it — a write from a superseded claim (its lease expired and something else has since picked the
 * row up) must not clobber a newer attempt's state. `services/attempt.ts` is the one caller, and
 * the one place a delivery's status legitimately moves past `in-flight`.
 *
 * @param id - the delivery row to update
 * @param leaseToken - the token the claim that is writing this outcome was handed — a caller
 *   narrows its own already-claimed row to a real `string` before calling this (`services/attempt.ts`'s
 *   `requireLeaseToken`); this signature never accepts `undefined` as "match a never-claimed row"
 * @param patch - the fields this outcome decided
 * @returns the updated row, or `null` if `leaseToken` no longer matches — the write is dropped,
 *   never retried: whatever holds the row now is responsible for its outcome
 */
const applyOutcome = (
    id: string,
    leaseToken: string,
    patch: Partial<
        Pick<
            WebhookDeliveryDocument,
            'status' | 'attempt' | 'responseCode' | 'durationMs' | 'error' | 'nextAttemptAt'
        >
    >
): Promise<WebhookDeliveryDocument | null> =>
    webhookDeliveryModel
        .findOneAndUpdate(
            { _id: toObjectId(id), leaseToken },
            { $set: patch },
            { returnDocument: 'after' }
        )
        .exec();

/**
 * Every delivery row due for an attempt right now, oldest first, PLUS any stranded `in-flight` row
 * whose lease already expired — the sweep's own read.
 *
 * Published without claiming: `services/sweep.ts` no longer calls {@link claimPending} before
 * publishing (the bug this lease design fixes — see `docs/modules/webhooks.md`'s lease section). A
 * row this read returns may already be mid-attempt by the time the publish lands; the WORKER's own
 * claim is what decides who actually does the one real HTTP attempt, so publishing an already-live
 * row twice is safe, not a race.
 *
 * @param limit - the ceiling per sweep run, so one very late sweep does not enqueue an unbounded burst
 */
const findDue = (limit: number): Promise<WebhookDeliveryDocument[]> =>
    webhookDeliveryModel
        .find({
            $or: [
                { status: 'pending', nextAttemptAt: { $lte: new Date() } },
                { status: 'in-flight', leaseExpiresAt: { $lt: new Date() } }
            ]
        })
        .sort({ nextAttemptAt: 1 })
        .limit(limit)
        .exec();

/** Explicit annotation for the same TS7056 reason as {@link webhookSubscriptionRepository}. */
export const webhookDeliveryRepository: Repository<WebhookDeliveryDocument> & {
    claimPending: typeof claimPending;
    claimForReplay: typeof claimForReplay;
    applyOutcome: typeof applyOutcome;
    findDue: typeof findDue;
} = {
    ...deliveryBase,
    claimPending,
    claimForReplay,
    applyOutcome,
    findDue
};
