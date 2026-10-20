/**
 * @module
 * Order repository. Unlike the other collections, orders are read through the aggregation
 * framework: an order embeds a product snapshot, and filtering on `items.product._id` is a
 * pipeline concern. The repository factory still supplies plain CRUD; search is overridden
 * below.
 */

import {
    reencryptOf,
    type ReencryptSpec,
    type ReencryptReport
} from '@infrastructure/security/reencrypt';
import {
    orderModel,
    applyOrderTransform,
    orderNumberCounterModel,
    orderEventModel,
    applyOrderEventTransform
} from './model';
import type { OrderDocument, OrderEventDocument, OrderReference } from './model';
import { paymentStatusFilter, returnStatusFilter } from './domain';
import type {
    DeliveryClock,
    FulfillmentSummary,
    StampedPaymentStatus,
    StampedReturnStatus
} from './domain';
import { Types } from 'mongoose';
import type { PipelineStage, QueryFilter, ClientSession } from 'mongoose';
import { incrementYearlyCounter } from '@infrastructure/persistence/yearly-counter';
import { encryptOrderPii } from './pii';
import { ANONYMIZED_EMAIL } from './domain/anonymization';
import { OrderStatus } from '@types';
import type { OrderPaymentStatus, OrderReturnStatus } from '@types';
import type { Order, OrderAddress } from '@types';
import {
    createRepository,
    toObjectId,
    withScope,
    type AppendOnlyLedger,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';
import {
    normalizePagination,
    buildPaginatedMeta,
    DEFAULT_SORT,
    SORT_COLLATION,
    sortOf,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import { setAndUnset } from '@infrastructure/persistence/changes';
import { checkedDelete, type DeleteOutcome } from '@infrastructure/persistence/versioning';

/**
 * What `sort` may order by: wire field → column. `totalPrice` is derived at serialisation, so it
 * is not a column and not sortable.
 */
const ORDER_SORTABLE = {
    createdAt: 'createdAt',
    status: 'status',
    email: 'email',
    payBy: 'payBy',
    paidAt: 'paidAt'
};

/** Plain CRUD from the repository factory; `search` below overrides its aggregation-free default. */
const base = createRepository<OrderDocument, Order>(orderModel, {
    transform: applyOrderTransform,
    searchable: {
        objectIds: {
            id: '_id',
            userId: 'userId',
            // Product data is embedded, not referenced — the snapshot's own `_id` is what
            // identifies which product an order line holds.
            productId: 'items.product._id'
        },
        exact: { email: 'email', status: 'status', paymentMethod: 'paymentMethod' },
        presence: { deleted: 'deletedAt' },
        dateRanges: {
            createdAt: { min: 'createdFrom', max: 'createdTo' },
            paidAt: { min: 'paidFrom', max: 'paidTo' }
        },
        sortable: ORDER_SORTABLE
    }
});

/**
 * Insert an order with its addresses and notes encrypted. The one write path for a new order —
 * `placeOrder`, the admin create and every factory go through it, so no row reaches the collection
 * with plaintext PII.
 *
 * @param data - the order to write; its `_id` is assigned here when absent, since it is in the AAD
 * @param session - joins the insert to the caller's own transaction
 */
const create = (data: Partial<OrderDocument>, session?: ClientSession): Promise<OrderDocument> => {
    const _id = data._id ?? new Types.ObjectId();
    return base.create({ ...encryptOrderPii(data, _id), _id }, session);
};

/**
 * Run an aggregation pipeline against the Order collection.
 */
const aggregate = <T = OrderDocument>(
    pipeline: PipelineStage[],
    collation?: typeof SORT_COLLATION
): Promise<T[]> => {
    const run = orderModel.aggregate<T>(pipeline);
    // Aggregate#collation: string comparison rules for the `$sort`.
    return (collation ? run.collation(collation) : run).exec();
};

/**
 * The `email` filter, normalised the same way the schema casts the stored field — `$match`
 * does not cast the way `find()` does (see `search` below), so a differently-cased search would
 * otherwise silently match nothing.
 */
const withNormalizedEmailFilter = (filters: object): object => {
    const bag = filters as Record<string, unknown>;
    return typeof bag.email === 'string' ? { ...bag, email: normalizeEmail(bag.email) } : filters;
};

/**
 * The declared filters, plus the two derived statuses mapped back to the stored fields behind
 * them. `$and`, so the two cannot overwrite each other's `paymentStatus`/`paidAt` keys.
 *
 * @param filters - the validated filter bag
 */
const withProjectionFilters = (filters: object): Record<string, unknown> => {
    const bag = filters as { paymentStatus?: OrderPaymentStatus; returnStatus?: OrderReturnStatus };
    const derived = [
        ...(bag.paymentStatus ? [paymentStatusFilter(bag.paymentStatus)] : []),
        ...(bag.returnStatus ? [returnStatusFilter(bag.returnStatus)] : [])
    ];
    const declared = base.buildWhere(withNormalizedEmailFilter(filters));
    return derived.length > 0 ? { $and: [declared, ...derived] } : declared;
};

/**
 * Filter → count → page → normalize, over the aggregation framework. `$match` is built from the
 * same declared spec the other repositories use, so id coercion happens before the pipeline is
 * assembled — unlike `find()`, `$match` doesn't cast. `async` so `buildWhere`'s synchronous
 * throw on a malformed id becomes a rejection, not a thrown error that bypasses the caller's
 * `.catch()`.
 */
const search = async (
    filters: object = {},
    scope: Record<string, unknown> = {}
): Promise<{ items: Order[]; meta: PaginatedMeta }> => {
    const pagination = normalizePagination(filters);
    // `withScope`, not a spread: the scope is the authorization boundary, and a spread lets a
    // client filter on the same key (`userId`) overwrite it — or the scope's `$or` overwrite the
    // filter's. Both must match.
    const match = withScope(withProjectionFilters(filters), scope);

    // `DEFAULT_SORT`, not a bare `createdAt` — the count and the page below are two separate
    // `aggregate()` calls, so a tie between them puts one order on page 1 AND page 2 and skips
    // another. Orders arrive in bursts (a seed, a bulk import, two concurrent checkouts), which
    // makes ties the normal case rather than the edge one.
    const chosen = sortOf(filters, ORDER_SORTABLE);
    const basePipeline: PipelineStage[] = [{ $match: match }, { $sort: chosen ?? DEFAULT_SORT }];

    return aggregate<{ totalItems?: number }>([...basePipeline, { $count: 'totalItems' }]).then(
        (countResults) => {
            const totalItems = countResults.at(0)?.totalItems ?? 0;

            // Aggregate#collation via the options tail: same text ordering as the other lists.
            return aggregate(
                [...basePipeline, { $skip: pagination.skip }, { $limit: pagination.pageSize }],
                chosen ? SORT_COLLATION : undefined
            ).then((items) => ({
                items: base.normalize(items),
                meta: buildPaginatedMeta(pagination, totalItems)
            }));
        }
    );
};

/**
 * How many orders a filter and a scope match — the count an export is refused on before it reads a
 * row. The same `$match` {@link search} builds, so the two can never disagree about "these orders".
 *
 * @param filters - the validated filter bag
 * @param scope - what the caller may read
 */
const countMatching = (
    filters: object = {},
    scope: Record<string, unknown> = {}
): Promise<number> =>
    aggregate<{ totalItems?: number }>([
        { $match: withScope(withProjectionFilters(filters), scope) },
        { $count: 'totalItems' }
    ]).then((counted) => counted.at(0)?.totalItems ?? 0);

/**
 * Every order a filter and a scope match, in the list's own order, read through a cursor so a large
 * export holds one batch in memory rather than the lot. Each row is normalized exactly like a list
 * row, so the file and the page can never disagree about a figure.
 *
 * @param filters - the validated filter bag, `sort` included
 * @param scope - what the caller may read
 */
async function* streamMatching(
    filters: object = {},
    scope: Record<string, unknown> = {}
): AsyncGenerator<Order> {
    const chosen = sortOf(filters, ORDER_SORTABLE);
    const run = orderModel.aggregate<OrderDocument>([
        { $match: withScope(withProjectionFilters(filters), scope) },
        { $sort: chosen ?? DEFAULT_SORT }
    ]);
    // Aggregate#cursor: a server-side cursor; `batchSize` is how many documents each round trip
    // brings. https://mongoosejs.com/docs/api/aggregate.html#Aggregate.prototype.cursor()
    const cursor = (chosen ? run.collation(SORT_COLLATION) : run).cursor({ batchSize: 500 });
    for await (const document of cursor) yield* base.normalize([document]);
}

/**
 * Fetch one order, restricted to a caller's own rows when `scope` narrows it — one query,
 * `findOne({ _id, ...scope })`, whether or not there's anything in `scope` to add: an empty
 * object is a no-op filter addition, so the unscoped (admin) and scoped (owner) calls run the
 * identical shape of query and always resolve the same hydrated Mongoose document. The scope
 * rides in the SAME query as the id — checking ownership after the read is how a scoped find
 * becomes an information leak. `async`, so a malformed `id`'s synchronous `toObjectId` throw
 * becomes a rejection rather than an exception that bypasses a caller's `.catch()`, the same
 * reasoning `search` above documents for `buildWhere`.
 */
const findByIdScoped = async (
    id: string,
    scope: Record<string, unknown> = {}
): Promise<OrderDocument | undefined> =>
    orderModel
        .findOne({ _id: toObjectId(id), ...scope })
        .exec()
        .then((order) => order ?? undefined);

/**
 * Restrict a query to one user's own orders.
 *
 * The `userId` on an order is an ObjectId, so the caller's id has to be coerced before it can
 * match — a raw string silently matches nothing inside a `$match`, which reads as "this user has
 * no orders" rather than as a mistake.
 */
const ownerScope = (userId: string): Record<string, unknown> => ({
    userId: toObjectId(userId)
});

/**
 * Move an order between statuses, but only from one of the expected ones — atomically. The
 * condition rides IN THE FILTER, not a preceding read: two requests racing an order (a customer
 * cancelling while admin marks it shipped) must not both read `pending` and both write. mongod
 * evaluates the filter while holding the document, so exactly one matches; the loser gets `null`
 * and a follow-up read only informs the error message. The scope composes the same way:
 * `callerScope` (`services/scope.ts`) rides in the same filter, so there's no window between an
 * ownership check and the write.
 *
 * @param options.scope - `callerScope`'s filter, when the caller is bound to its own orders
 * @param options.session - joins the write to the caller's transaction — a cancel moves the
 *   status, the hold and the stock together or not at all
 */
const updateStatusIfIn = (
    id: string,
    from: readonly string[],
    to: string,
    { scope, session }: { scope?: Record<string, unknown>; session?: ClientSession } = {}
): Promise<OrderDocument | null> =>
    orderModel
        .findOneAndUpdate(
            // `as QueryFilter`, the same cast `create-repository.ts` makes for the same reason:
            // spreading a `Record<string, unknown>` scope widens the object past what the filter
            // generic accepts, and the alternative is typing every caller's scope per collection.
            {
                _id: toObjectId(id),
                ...scope,
                status: { $in: [...from] }
            } as QueryFilter<OrderDocument>,
            { $set: { status: to } },
            { returnDocument: 'after', session }
        )
        .exec();

/**
 * Move an order from `from` to `paid`, stamping `paidAt` in the SAME write — its own function
 * rather than a call through {@link updateStatusIfIn}, since `paidAt` is a `paid`-only fact and
 * every other status move has nothing to add to `$set`. The conditional filter is what makes this
 * at-most-once, same reasoning as {@link updateStatusIfIn}'s own docblock: `paidAt` is stamped
 * exactly once, by whichever caller's write actually lands.
 * @param id - the order to move
 * @param from - the status this move must currently be in — see `domain/lifecycle.ts`'s
 *   `statusesLeadingTo`
 * @param paymentMethod - how it was actually paid, when that is a fact the order should keep
 *   (a card settling a bank-transfer order); absent leaves the checkout choice as it was
 * @param session - joins the write to the caller's transaction, so its outbox row rides with it
 * @returns the order as it now stands, or `null` if it was not in `from`
 */
const markPaid = (
    id: string,
    from: OrderStatus,
    paymentMethod?: 'card',
    session?: ClientSession
): Promise<OrderDocument | null> =>
    orderModel
        .findOneAndUpdate(
            { _id: toObjectId(id), status: from } as QueryFilter<OrderDocument>,
            {
                $set: {
                    status: OrderStatus.paid,
                    paidAt: new Date(),
                    ...(paymentMethod ? { paymentMethod } : {})
                }
            },
            { returnDocument: 'after', session }
        )
        .exec();

/**
 * Move an order to `delivered` and freeze its withdrawal deadline in the SAME write — the deadline
 * is a fact about the moment of delivery, so it lands with it or not at all, like `paidAt` does
 * with `paid`. Its own function rather than a call through {@link updateStatusIfIn}, whose `$set`
 * has no slot for a stamp.
 * @param id - the order that arrived
 * @param from - the status this move must currently be in
 * @param clock - the withdrawal and guarantee deadlines to freeze with the move
 * @param session - joins the write to the caller's transaction, so its outbox row rides with it
 * @returns the order as it now stands, or `null` if it was not in `from`
 */
const markDelivered = (
    id: string,
    from: OrderStatus,
    clock: DeliveryClock,
    session?: ClientSession
): Promise<OrderDocument | null> =>
    orderModel
        .findOneAndUpdate(
            { _id: toObjectId(id), status: from } as QueryFilter<OrderDocument>,
            { $set: { status: OrderStatus.delivered, ...clock } },
            { returnDocument: 'after', session }
        )
        .exec();

/**
 * Replace where an order ships, encrypted under the order's own id like the address it replaces.
 * Conditional on the status the caller read and on nothing having shipped, so a correction that
 * lost a race against a dispatch writes nothing.
 * @param id - the order
 * @param observedStatus - the status the caller read; the write lands only while it still holds
 * @param address - the corrected address, in the clear
 * @param session - joins the write to the caller's transaction, so its timeline row rides with it
 * @returns the order as it now stands, or `null` if it moved or shipped in between
 */
const replaceShippingAddress = (
    id: string,
    observedStatus: OrderStatus,
    address: OrderAddress,
    session?: ClientSession
): Promise<OrderDocument | null> =>
    orderModel
        .findOneAndUpdate(
            {
                _id: toObjectId(id),
                status: observedStatus,
                'fulfillment.shipped': { $ne: true }
            } as QueryFilter<OrderDocument>,
            {
                $set: {
                    shippingAddress: encryptOrderPii({ shippingAddress: address }, toObjectId(id))
                        .shippingAddress
                }
            },
            { returnDocument: 'after', session }
        )
        .exec();

/**
 * Write one of the projections another module owns (`paymentStatus`, `returnStatus`). Unconditional
 * on purpose: a projection is a report of a fact the owner already decided, so a repeat writes the
 * same value, and `undefined` clears it — "no return holds goods" is the absence of the field.
 * @param id - the order
 * @param fields - the projection(s) to set; a key set to `undefined` is unset
 * @param session - the caller's transaction, when the stamp must commit or roll back with it
 * @returns whether an order was found
 */
const setProjection = (
    id: string,
    fields: {
        paymentStatus?: StampedPaymentStatus | undefined;
        returnStatus?: StampedReturnStatus | undefined;
    },
    session?: ClientSession
): Promise<boolean> => {
    // `in`, not a truthiness check: a key present as `undefined` means clear, absent means leave.
    const changes = Object.fromEntries(
        (['paymentStatus', 'returnStatus'] as const)
            .filter((key) => key in fields)
            .map((key) => [key, fields[key]])
    );

    return orderModel
        .updateOne({ _id: toObjectId(id) }, setAndUnset(changes), { session })
        .exec()
        .then(({ matchedCount }) => matchedCount > 0);
};

/**
 * Move an order to `to` only if it still stands at the status the caller read, so the timeline
 * row's `from` is always the stored pre-state. The override's timeline row is written by the
 * caller, in the same transaction.
 * @param id - the order to move
 * @param from - the status the caller read; the write lands only if the order is still there
 * @param to - the status being written
 * @param clock - the deadlines to freeze in the same write, for a move into `delivered`;
 *   absent for every other destination
 * @param session - joins the write to the caller's transaction, so its outbox row rides with it
 * @returns the order as it now stands, or `null` if `id`'s current status is no longer `from`
 */
const applyStatusOverride = (
    id: string,
    from: OrderStatus,
    to: OrderStatus,
    clock?: DeliveryClock,
    session?: ClientSession
): Promise<OrderDocument | null> =>
    orderModel
        .findOneAndUpdate(
            { _id: toObjectId(id), status: from } as QueryFilter<OrderDocument>,
            { $set: { status: to, ...clock } },
            { returnDocument: 'after', session }
        )
        .exec();

/**
 * One order read inside the caller's transaction — the act that reads an order and then writes
 * beside it must see the same snapshot its own writes land in.
 * @param id - the order
 * @param session - the caller's transaction
 */
const findInSession = (id: string, session: ClientSession): Promise<OrderDocument | null> =>
    orderModel.findById(toObjectId(id)).session(session).exec();

/**
 * Write the fulfilment summary `delivery` computed, but only while the order can still be
 * fulfilled: not `pending`, not `cancelled`. `delivered` is allowed: an admin override forward to
 * `delivered` is brought in step by `delivery` AFTER the status landed. The condition rides in the filter, so a shipment
 * racing a cancel cannot both win — whichever write commits second matches nothing (or conflicts
 * and is retried against the other's result).
 * @param id - the order
 * @param summary - where the goods stand, recomputed in the caller's transaction
 * @param session - the act's transaction
 * @returns the order as it now stands, or `null` when it can no longer be fulfilled
 */
const writeFulfillment = (
    id: string,
    summary: FulfillmentSummary,
    session: ClientSession
): Promise<OrderDocument | null> =>
    orderModel
        .findOneAndUpdate(
            {
                _id: toObjectId(id),
                status: {
                    $in: [
                        OrderStatus.paid,
                        OrderStatus.processing,
                        OrderStatus.shipped,
                        OrderStatus.delivered
                    ]
                }
            } as QueryFilter<OrderDocument>,
            { $set: { fulfillment: summary } },
            { returnDocument: 'after', session }
        )
        .exec();

/**
 * What a sibling that lists something else composes onto its rows: the order's number and email.
 * Lean and projected, so no line, address or note is read.
 *
 * @param ids - the orders wanted; unknown ids are simply absent from the answer
 * @returns one reference per order found
 */
const findManyReferences = (ids: readonly string[]): Promise<OrderReference[]> =>
    orderModel
        .find({ _id: { $in: ids.map((id) => toObjectId(id)) } }, { orderNumber: 1, email: 1 })
        .lean()
        .exec()
        .then((rows) =>
            rows.map((row) => ({
                id: String(row._id),
                orderNumber: row.orderNumber,
                email: row.email
            }))
        );

/**
 * The ids of this account's never-paid orders still open — `pending`, with no `paidAt`, whatever
 * the payment method (a card still `processing` counts). Two readers: checkout's open-order cap, and
 * an erasure, which has to cancel them, read BEFORE {@link detachUserId} unsets the `userId` that
 * finds them.
 *
 * @param userId - the account being checked or erased
 * @param session - the erasure's transaction, so the read sees what the detach will update
 * @returns the order ids
 */
const findOpenUnpaidIdsOf = (userId: string, session?: ClientSession): Promise<string[]> =>
    orderModel
        .find(
            {
                userId: toObjectId(userId),
                status: OrderStatus.pending,
                paidAt: { $exists: false }
            },
            { _id: 1 },
            session ? { session } : {}
        )
        .exec()
        .then((orders) => orders.map((order) => String(order._id)));

/**
 * The ids of every order this account has cancelled — the narrow read the purchase-hold count
 * starts from, followed by the timeline for when each was cancelled and by whom.
 *
 * @param userId - the account
 * @returns the order ids
 */
const findCancelledIdsOf = (userId: string): Promise<string[]> =>
    orderModel
        .find({ userId: toObjectId(userId), status: OrderStatus.cancelled }, { _id: 1 })
        .exec()
        .then((orders) => orders.map((order) => String(order._id)));

/**
 * The per-order PII clock, as an aggregation expression: `max(now, createdAt + retentionDays)`, and
 * `now` itself for a never-paid order. Shared by erasure ({@link detachUserId}) and inactivity
 * minimisation ({@link startPiiClock}), so both stamp the same date for the same order.
 *
 * The `$max` is what stops an order already past its own window from getting a fresh ten years just
 * because the account was erased today. A never-paid order (`paidAt` unset — `pending`, or cancelled
 * before ever reaching `paid`) is due AT ONCE instead: it is no tax record at all, so Art. 17(3)(b)/(e)'s
 * retention reason never applied to it in the first place.
 *
 * @param now - the moment the clock is started
 * @param retentionDays - how many days of PII a PAID order gets from ITS OWN `createdAt`
 */
const piiClockExpression = (now: Date, retentionDays: number) => ({
    // `$paidAt` missing evaluates falsy in `$cond`'s own boolean rules —
    // no `$ifNull` needed. https://www.mongodb.com/docs/manual/reference/operator/aggregation/cond/
    $cond: {
        if: '$paidAt',
        // MongoDB's own `$cond` operator syntax requires this exact key;
        // it is data for the aggregation pipeline, never awaited as a value.
        // eslint-disable-next-line unicorn/no-thenable -- see comment above
        then: {
            $max: [
                now,
                { $dateAdd: { startDate: '$createdAt', unit: 'day', amount: retentionDays } }
            ]
        },
        else: now
    }
});

/**
 * Unset `userId` on every order this account placed, and mark each for
 * `reap:orders` to scrub later — `users`' `personalData.erase` hook. The order row
 * is never touched otherwise: it is the invoice, kept whole until its own `anonymizeAfter`.
 *
 * An aggregation-pipeline update, not a flat `$set`, because the clock runs PER ORDER: a decade-old
 * order is due almost immediately, not ten years from today (see {@link piiClockExpression}).
 *
 * @param userId - the erased account's id
 * @param retentionDays - how many days of PII a PAID order gets from ITS OWN `createdAt`
 * @returns how many orders were detached
 */
const detachUserId = (
    userId: string,
    retentionDays: number,
    session?: ClientSession
): Promise<number> =>
    orderModel
        .updateMany(
            { userId: toObjectId(userId) },
            [
                {
                    $set: {
                        userId: '$$REMOVE',
                        anonymizeAfter: piiClockExpression(new Date(), retentionDays)
                    }
                }
            ],
            // `updatePipeline: true` — Mongoose refuses an array update otherwise ("Cannot pass an
            // array to query updates unless the `updatePipeline` option is set"), since an array
            // and an update-operator OBJECT are both valid `updateMany` arguments with different
            // semantics. https://mongoosejs.com/docs/api/query.html#Query.prototype.setUpdate()
            { timestamps: false, updatePipeline: true, ...(session ? { session } : {}) }
        )
        .exec()
        .then(({ modifiedCount }) => modifiedCount);

/**
 * Start the PII clock on every order an account placed, keeping its `userId` — `personalData.minimise`
 * for an inactive account. Orders already carrying a clock are left alone, so a rerun is a no-op and
 * an order's date never moves later.
 *
 * @param userId - the inactive account's id
 * @param retentionDays - how many days of PII a PAID order gets from ITS OWN `createdAt`
 * @returns how many orders were stamped
 */
const startPiiClock = (userId: string, retentionDays: number): Promise<number> =>
    orderModel
        .updateMany(
            { userId: toObjectId(userId), anonymizeAfter: { $exists: false } },
            [{ $set: { anonymizeAfter: piiClockExpression(new Date(), retentionDays) } }],
            // Pipeline update, no `updatedAt` bump: see `detachUserId`.
            { timestamps: false, updatePipeline: true }
        )
        .exec()
        .then(({ modifiedCount }) => modifiedCount);

/**
 * `reap:orders`'s sweep: every order whose `anonymizeAfter` has elapsed loses its
 * remaining PII in one write.
 *
 * Scrub:      both embedded addresses and `notes` are UNSET; `email` is replaced, since the schema
 *             requires it. Nothing personal survives on the order.
 * Why unset:  `required` never fires on a bulk update, and a scrubbed row with no address reads
 *             as "none" rather than as a placeholder that looks real. City, zip and country go
 *             too, so no half-address is left to re-identify a buyer.
 * Invoices:   untouched. An invoice is the legal copy (a tax record), kept whole; its address is
 *             encrypted at rest like any other PII (GDPR Art. 32).
 * Versioned:  the scrub is an edit, so `updatedAt` moves (no `timestamps: false`) — an open edit
 *             form holding the old ETag is refused instead of putting the email back.
 * Idempotent: `anonymizeAfter` is unset in the same write, so the sparse index it carries no
 *             longer holds the row and the next sweep's `$lte` filter cannot match it again.
 *
 * @param cutoff - orders whose `anonymizeAfter` is at or before this instant are due
 * @returns how many orders were scrubbed
 */
const scrubDueForAnonymization = (cutoff: Date): Promise<number> =>
    orderModel
        .updateMany(
            { anonymizeAfter: { $lte: cutoff } },
            {
                $set: { email: ANONYMIZED_EMAIL },
                $unset: { anonymizeAfter: 1, notes: 1, shippingAddress: 1, billingAddress: 1 }
            }
        )
        .exec()
        .then(({ modifiedCount }) => modifiedCount);

/**
 * The next order-number sequence for `year`: one atomic upsert, so two callers racing the same
 * year still get distinct, contiguous numbers. No session, because the number is a label and a
 * gap is acceptable — see `services/order-numbering.ts`.
 *
 * @param year - the shop-calendar year the sequence belongs to
 * @returns the sequence number just allocated (1 for the year's first order)
 */
const incrementOrderNumberCounter = (year: number): Promise<number> =>
    incrementYearlyCounter(orderNumberCounterModel, year);

/**
 * Permanently remove an order that is cancelled and was never paid, as one conditional write: the
 * delete's own filter carries both, so a settlement or a status move that landed after the caller
 * read the document stops it (Optimistic Offline Lock). Checked against the request's `If-Match`
 * like `deleteOne`.
 *
 * @param document - the order, as the caller read it
 * @returns `false` when nothing was removed: the order moved on meanwhile, or is already gone
 */
const deleteCancelledUnpaid = (document: OrderDocument): Promise<boolean> => {
    let deleted = false;

    return checkedDelete(document, () => {
        // Mongoose merges a document's `$where` into its delete filter. `null` matches a missing
        // `paidAt`, so an order never paid matches. Cleared after, as `versioning.ts` does, so a
        // second use of the same object is not filtered on this one.
        // https://mongoosejs.com/docs/api/document.html#Document.prototype.$where
        Object.assign(document, {
            $where: { ...(document.$where as object), status: OrderStatus.cancelled, paidAt: null }
        });
        return (document.deleteOne() as Promise<DeleteOutcome>)
            .then((outcome) => {
                deleted = outcome.deletedCount > 0;
                return outcome;
            })
            .finally(() => {
                Reflect.deleteProperty(document, '$where');
            });
    }).then(() => deleted);
};

/**
 * `search` is narrower than the base signature (no caller-supplied sort — the pipeline fixes it),
 * so it is omitted from the base contract rather than intersected with it.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056).
 */
export const orderRepository: Omit<Repository<OrderDocument, Order>, 'search'> & {
    aggregate: <T = OrderDocument>(pipeline: PipelineStage[]) => Promise<T[]>;
    reencrypt: (spec: ReencryptSpec<OrderDocument>, dryRun?: boolean) => Promise<ReencryptReport>;
    search: (
        filters?: object,
        scope?: Record<string, unknown>
    ) => Promise<{ items: Order[]; meta: PaginatedMeta }>;
    countMatching: (filters?: object, scope?: Record<string, unknown>) => Promise<number>;
    streamMatching: (filters?: object, scope?: Record<string, unknown>) => AsyncGenerator<Order>;
    findByIdScoped: (
        id: string,
        scope?: Record<string, unknown>
    ) => Promise<OrderDocument | undefined>;
    deleteCancelledUnpaid: (document: OrderDocument) => Promise<boolean>;
    ownerScope: (userId: string) => Record<string, unknown>;
    updateStatusIfIn: (
        id: string,
        from: readonly string[],
        to: string,
        options?: { scope?: Record<string, unknown>; session?: ClientSession }
    ) => Promise<OrderDocument | null>;
    markPaid: (
        id: string,
        from: OrderStatus,
        paymentMethod?: 'card',
        session?: ClientSession
    ) => Promise<OrderDocument | null>;
    setProjection: (
        id: string,
        fields: {
            paymentStatus?: StampedPaymentStatus | undefined;
            returnStatus?: StampedReturnStatus | undefined;
        },
        session?: ClientSession
    ) => Promise<boolean>;
    markDelivered: (
        id: string,
        from: OrderStatus,
        clock: DeliveryClock,
        session?: ClientSession
    ) => Promise<OrderDocument | null>;
    replaceShippingAddress: typeof replaceShippingAddress;
    applyStatusOverride: (
        id: string,
        from: OrderStatus,
        to: OrderStatus,
        clock?: DeliveryClock,
        session?: ClientSession
    ) => Promise<OrderDocument | null>;
    findInSession: (id: string, session: ClientSession) => Promise<OrderDocument | null>;
    writeFulfillment: (
        id: string,
        summary: FulfillmentSummary,
        session: ClientSession
    ) => Promise<OrderDocument | null>;
    findManyReferences: (ids: readonly string[]) => Promise<OrderReference[]>;
    findOpenUnpaidIdsOf: (userId: string, session?: ClientSession) => Promise<string[]>;
    findCancelledIdsOf: (userId: string) => Promise<string[]>;
    detachUserId: (
        userId: string,
        retentionDays: number,
        session?: ClientSession
    ) => Promise<number>;
    startPiiClock: (userId: string, retentionDays: number) => Promise<number>;
    scrubDueForAnonymization: (cutoff: Date) => Promise<number>;
    incrementOrderNumberCounter: (year: number) => Promise<number>;
} = {
    ...base,
    reencrypt: reencryptOf(orderModel),
    create,
    aggregate,
    search,
    countMatching,
    streamMatching,
    findByIdScoped,
    deleteCancelledUnpaid,
    ownerScope,
    updateStatusIfIn,
    markPaid,
    markDelivered,
    replaceShippingAddress,
    setProjection,
    applyStatusOverride,
    findInSession,
    writeFulfillment,
    findManyReferences,
    findOpenUnpaidIdsOf,
    findCancelledIdsOf,
    detachUserId,
    startPiiClock,
    scrubDueForAnonymization,
    incrementOrderNumberCounter
};

/**
 * The timeline's ledger. {@link AppendOnlyLedger} for the writes the app makes in the course of
 * business; the three removals below are the only edits a row ever sees, each for a reason the
 * law gives rather than the app:
 *
 * - `clearActor`: the staff account was erased.
 * - `scrubTextBefore`: the free text outlived its retention window; the row stays.
 * - `deleteByOrderId`: the order itself was hard-deleted, so there is nothing left to narrate.
 */
export const orderEventRepository: AppendOnlyLedger<
    OrderEventDocument,
    Wire<OrderEventDocument>
> & {
    findByOrderId: (orderId: string) => Promise<OrderEventDocument[]>;
    findByOrderIds: (orderIds: readonly string[]) => Promise<OrderEventDocument[]>;
    findBuyerCancelTimes: (orderIds: readonly string[], after?: Date) => Promise<Date[]>;
    clearActor: (actor: string, session?: ClientSession) => Promise<number>;
    scrubTextBefore: (cutoff: Date) => Promise<number>;
    deleteByOrderId: (orderId: string) => Promise<number>;
} = {
    ...createRepository<OrderEventDocument, Wire<OrderEventDocument>>(orderEventModel, {
        transform: applyOrderEventTransform
    }),

    /**
     * One order's rows, oldest first. Ties on `at` end on the id, so two rows written in one
     * transaction keep the order they were appended in.
     *
     * @param orderId - the order
     */
    findByOrderId: (orderId) =>
        orderEventModel
            .find({ orderId: toObjectId(orderId) })
            .sort({ at: 1, _id: 1 })
            .exec(),

    /**
     * Every row of several orders, grouped by order and oldest first within it — the data export's read.
     *
     * @param orderIds - the orders
     */
    findByOrderIds: (orderIds) =>
        orderEventModel
            .find({ orderId: { $in: orderIds.map((id) => toObjectId(id)) } })
            .sort({ orderId: 1, at: 1, _id: 1 })
            .exec(),

    /**
     * When the buyer themselves cancelled each of these orders, after `after` when given — the rows
     * the purchase hold counts. A cancel by staff or by the system is a different `by`.
     *
     * @param orderIds - the buyer's cancelled orders
     * @param after - rows at or before this instant were already answered by an earlier hold or review
     */
    findBuyerCancelTimes: (orderIds, after) =>
        orderEventModel
            .find({
                orderId: { $in: orderIds.map((id) => toObjectId(id)) },
                type: 'cancelled',
                'data.by': 'customer',
                ...(after ? { at: { $gt: after } } : {})
            })
            .select({ at: 1 })
            .exec()
            .then((rows) => rows.map((row) => row.at)),

    /**
     * Unset the `actor` on every row one account made.
     *
     * @param actor - the erased account's id
     * @param session - joins the clear to the erasure's transaction
     * @returns how many rows lost their actor
     */
    clearActor: (actor, session) =>
        orderEventModel
            .updateMany({ actor }, { $unset: { actor: 1 } }, { session })
            .exec()
            .then(({ modifiedCount }) => modifiedCount),

    /**
     * Unset the free text on rows older than `cutoff`. Only rows still holding text match, so a
     * repeat run touches nothing.
     *
     * @param cutoff - rows at or before this instant lose their text
     * @returns how many rows lost their text
     */
    scrubTextBefore: (cutoff) =>
        orderEventModel
            .updateMany({ text: { $exists: true }, at: { $lte: cutoff } }, { $unset: { text: 1 } })
            .exec()
            .then(({ modifiedCount }) => modifiedCount),

    /**
     * Remove every row of an order that no longer exists.
     *
     * @param orderId - the deleted order
     * @returns how many rows went
     */
    deleteByOrderId: (orderId) =>
        orderEventModel
            .deleteMany({ orderId: toObjectId(orderId) })
            .exec()
            .then(({ deletedCount }) => deletedCount)
};
