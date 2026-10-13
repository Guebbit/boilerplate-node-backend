/**
 * @module
 * Standard CRUD via the repository factory, plus the two lookups and the one guarded write payments
 * actually take. `unique` on `orderId` makes "one payment per order" a database fact, so the intent
 * upsert is a single `findOneAndUpdate` with no read in front of it. The return type is written out
 * because Mongoose's generics are too large for TypeScript to infer at an export boundary (TS7056).
 */

import type { ClientSession, PipelineStage, Types } from 'mongoose';
import { paymentModel, applyPaymentTransform } from './model';
import { PaymentStatus, PaymentMethod } from '@types';
import { decimalSum, type ReportWindow } from '@infrastructure/persistence/report';
import type { RefundFailureReason, RefundReason, RefundStatus } from '@types';
import type { PaymentDocument, RefundRecord } from './model';
import {
    CONFIRMABLE_PAYMENT_STATUSES,
    OPEN_REFUND_STATUSES,
    SETTLEABLE_PAYMENT_STATUSES
} from './domain';
import {
    createRepository,
    toObjectId,
    withScope,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';
import {
    buildPaginatedMeta,
    DEFAULT_SORT,
    normalizePagination,
    SORT_COLLATION,
    sortOf,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { setAndUnset } from '@infrastructure/persistence/changes';

/**
 * `providerRef` is what `applyPaymentTransform` omits — internal bookkeeping never part of the
 * wire contract — so the search wire type drops it too.
 */
export type PaymentWire = Omit<Wire<PaymentDocument>, 'providerRef'>;

/** What the staff list may order by: wire field → column. */
const PAYMENT_SORTABLE = { createdAt: 'createdAt', amount: 'amount' };

/**
 * What the staff list filters by, declared once. `displayStatus` is not here: it is a label, not a
 * field, so {@link searchStaff} adds its query itself.
 */
const PAYMENT_SEARCHABLE = {
    objectIds: { orderId: 'orderId' },
    exact: { method: 'method', provider: 'provider', reference: 'reference' },
    ranges: { amount: { min: 'amountMin', max: 'amountMax' } },
    dateRanges: {
        createdAt: { min: 'createdFrom', max: 'createdTo' },
        receivedAt: { min: 'receivedFrom', max: 'receivedTo' }
    },
    sortable: PAYMENT_SORTABLE
};

/** The payments mix, one row per method, provider and currency; `amount` is a decimal sum. */
export interface MixSums {
    _id: { method: PaymentMethod; provider: string; currency: string };
    payments: number;
    amount: unknown;
}

/** One refund with the ids of the payment it sits on, as `$unwind` hands it back. */
export interface RefundRow {
    paymentId: Types.ObjectId;
    orderId: Types.ObjectId;
    provider: string;
    refund: RefundRecord;
}

/** What {@link paymentRepository.searchRefunds} filters by. */
export interface RefundFilters {
    status?: RefundStatus;
    reason?: RefundReason;
    orderId?: string;
    createdFrom?: Date;
    createdTo?: Date;
    page?: number;
    pageSize?: number;
}

/**
 * The `$match` over an unwound refund for the Refunds tab.
 * @param filters - what the caller asked for
 * @returns conditions on `refunds.*`, empty when nothing was asked
 */
const refundMatch = (filters: RefundFilters): Record<string, unknown> => ({
    ...(filters.status ? { 'refunds.status': filters.status } : {}),
    ...(filters.reason ? { 'refunds.reason': filters.reason } : {}),
    ...(filters.createdFrom || filters.createdTo
        ? {
              'refunds.createdAt': {
                  ...(filters.createdFrom ? { $gte: filters.createdFrom } : {}),
                  ...(filters.createdTo ? { $lte: filters.createdTo } : {})
              }
          }
        : {})
});

/**
 * Aggregation over the Payment collection.
 * @param pipeline - the stages
 */
const aggregatePayments = <T>(pipeline: PipelineStage[]): Promise<T[]> =>
    paymentModel.aggregate<T>(pipeline).exec();

/** The shape every refund read projects out of the `$unwind`. */
const REFUND_ROW_PROJECTION: PipelineStage = {
    $project: { _id: 0, paymentId: '$_id', orderId: 1, provider: 1, refund: '$refunds' }
};

/** What an upsert answers: the row, and whether this call inserted it rather than refreshing one. */
export interface UpsertedPayment {
    payment: PaymentDocument;
    created: boolean;
}

/**
 * The mechanics {@link paymentRepository.upsertIntent} and {@link paymentRepository.upsertOffline}
 * share: the same filter — an order's row still sitting at a status nobody has paid past — the same
 * upsert options, and the same duplicate-key collision mapped to `null` rather than thrown, since
 * that collision IS the answer "this order's money already moved". Callers differ only in what they
 * change and whose id lands on an insert.
 * @param orderId - the order the payment belongs to
 * @param userId - the payer to attach on INSERT only; absent writes no `userId` at all — an intent
 *   or offline record against an order whose account is already erased pays for real, with no
 *   payer to record
 * @param changes - this caller's own fields: a value is `$set`, `undefined` is `$unset`
 */
const upsertConfirmable = (
    orderId: string,
    userId: string | undefined,
    changes: Record<string, unknown>
): Promise<UpsertedPayment | null> =>
    paymentModel
        .findOneAndUpdate(
            {
                orderId: toObjectId(orderId),
                status: { $in: [...CONFIRMABLE_PAYMENT_STATUSES] }
            },
            {
                ...setAndUnset(changes),
                $setOnInsert: userId === undefined ? {} : { userId: toObjectId(userId) }
            },
            // `includeResultMetadata`: the driver's own answer to "did this insert or update" —
            // https://mongoosejs.com/docs/api/query.html#Query.prototype.findOneAndUpdate()
            { upsert: true, returnDocument: 'after', includeResultMetadata: true }
        )
        .exec()
        .then((result) =>
            result.value
                ? {
                      payment: result.value,
                      created: result.lastErrorObject?.updatedExisting === false
                  }
                : null
        )
        .catch((error: unknown) => {
            if (isDuplicateKey(error)) return null;
            throw error;
        });

/** The factory's CRUD, kept by name so the bespoke reads below can use `buildWhere`/`count`/`findAll`. */
const base = createRepository<PaymentDocument, PaymentWire>(paymentModel, {
    transform: applyPaymentTransform,
    searchable: PAYMENT_SEARCHABLE
});

/** Payment CRUD, ownership scoping, and the intent/status writes the service depends on. */
export const paymentRepository: Repository<PaymentDocument, PaymentWire> & {
    ownerScope: (userId: string) => Record<string, unknown>;
    findByIdScoped: (
        paymentId: string,
        scope?: Record<string, unknown>
    ) => Promise<PaymentDocument | null>;
    findByOrderId: (
        orderId: string,
        scope?: Record<string, unknown>
    ) => Promise<PaymentDocument | null>;
    findByProviderRef: (providerRef: string) => Promise<PaymentDocument | null>;
    attachProviderRef: (paymentId: string, providerRef: string) => Promise<PaymentDocument | null>;
    upsertIntent: (
        orderId: string,
        userId: string | undefined,
        data: { amount: number; currency: string; provider: string }
    ) => Promise<UpsertedPayment | null>;
    upsertOffline: (
        orderId: string,
        userId: string | undefined,
        data: {
            amount: number;
            currency: string;
            method: PaymentMethod;
            reference?: string;
            receivedAt: Date;
        }
    ) => Promise<UpsertedPayment | null>;
    detachUserId: (userId: string, session?: ClientSession) => Promise<number>;
    deleteAbandonedBefore: (cutoff: Date) => Promise<number>;
    updateStatusIfIn: (
        orderId: string,
        from: readonly PaymentStatus[],
        to: PaymentStatus,
        extra?: Partial<PaymentDocument>,
        session?: ClientSession
    ) => Promise<PaymentDocument | null>;
    addRefund: (
        paymentId: string,
        expectedRefunded: number,
        newRefunded: number,
        refund: Pick<
            RefundRecord,
            '_id' | 'amount' | 'currency' | 'reason' | 'idempotencyKey' | 'status'
        >,
        session?: ClientSession
    ) => Promise<PaymentDocument | null>;
    settleRefund: (
        paymentId: string,
        refundId: string,
        fields: { providerRefundRef?: string; refundedByHand?: true },
        session?: ClientSession
    ) => Promise<PaymentDocument | null>;
    failRefund: (
        paymentId: string,
        refundId: string,
        failureReason: RefundFailureReason,
        session?: ClientSession
    ) => Promise<PaymentDocument | null>;
    searchStaff: (
        filters: object,
        label: Record<string, unknown> | undefined,
        scope: Record<string, unknown>
    ) => Promise<{ items: PaymentDocument[]; meta: PaginatedMeta }>;
    searchRefunds: (filters: RefundFilters) => Promise<{ items: RefundRow[]; meta: PaginatedMeta }>;
    sumMix: (window: ReportWindow) => Promise<MixSums[]>;
    findOpenRefundRows: (options: {
        manual: boolean;
        openBefore?: Date;
        limit: number;
    }) => Promise<RefundRow[]>;
    findWithOpenRefunds: (updatedBefore: Date, limit: number) => Promise<PaymentDocument[]>;
    findStaleInFlight: (updatedBefore: Date, limit: number) => Promise<PaymentDocument[]>;
} = {
    ...base,

    /**
     * Restrict a query to one user's own payments — spread into a filter; admins pass nothing.
     *
     * @param userId - the caller's id
     * @returns the filter fragment restricting a query to their payments
     */
    ownerScope: (userId: string) => ({ userId: toObjectId(userId) }),

    /**
     * One payment by its own id, optionally restricted to a caller's own rows.
     *
     * Scoped in the FILTER, not checked after the read: checking ownership post-read turns a
     * scoped find into an information leak, with a window between the check and the read's use.
     *
     * @param paymentId - the payment
     * @param scope - the caller's scope, or `undefined` for an admin
     * @returns the payment if it is theirs to see, otherwise `null`
     */
    findByIdScoped: (paymentId: string, scope?: Record<string, unknown>) =>
        paymentModel.findOne({ _id: toObjectId(paymentId), ...scope }).exec(),

    /**
     * The payment behind an order, or `null` when no intent was ever created — or when it is not
     * this caller's to see. Same scope-in-the-filter rule as {@link findByIdScoped}.
     *
     * @param orderId - the order
     * @param scope - the caller's scope, or `undefined` for an admin
     */
    findByOrderId: (orderId: string, scope?: Record<string, unknown>) =>
        paymentModel.findOne({ orderId: toObjectId(orderId), ...scope }).exec(),

    /**
     * The payment a webhook delivery names. UNSCOPED, and the only read here that is: a provider
     * is not a logged-in caller and has no user whose rows to restrict this to. What authenticates
     * it is the signature over the delivery, checked before this is ever reached.
     *
     * @param providerRef - the provider's own intent id
     */
    findByProviderRef: (providerRef: string) => paymentModel.findOne({ providerRef }).exec(),

    /**
     * Record the provider's intent id on a payment that has just been prepared.
     *
     * Conditional on the field still being absent, which is what makes re-preparing safe: a second
     * request that raced the first finds nothing to write and reads back the reference already
     * there, rather than pointing the payment at a second intent the customer could also pay.
     *
     * @returns the payment as it now stands, whichever of the two references won
     */
    attachProviderRef: (paymentId, providerRef) =>
        paymentModel
            .findOneAndUpdate(
                { _id: toObjectId(paymentId), providerRef: { $exists: false } },
                { $set: { providerRef } },
                { returnDocument: 'after' }
            )
            .exec()
            .then((updated) => updated ?? paymentModel.findById(toObjectId(paymentId)).exec()),

    /**
     * Create or refresh the intent for an order. Re-asking (the double-click case) re-freezes the
     * amount and resets to `requires_confirmation`, but ONLY from a state where nobody has paid —
     * the `$in` guard enforces that the same way the order's own status machine does.
     *
     * Past confirmation (`succeeded`, `refunded`) the filter misses and the upsert collides with
     * the unique index instead: that duplicate key IS the answer "this order's money already
     * moved", surfaced as `null` rather than an exception.
     */
    upsertIntent: (orderId, userId, data) =>
        upsertConfirmable(orderId, userId, {
            ...data,
            method: PaymentMethod.card,
            status: 'requires_confirmation'
        }),

    /**
     * Create or refresh the payment record for an order paid by hand — same filter as
     * {@link upsertIntent}'s, and the same reason: the row of a card payment nobody confirmed
     * (`requires_confirmation`, `declined`) becomes the offline one rather than colliding with it.
     * Left at `requires_confirmation` here; `settlePayment` is what moves it to `succeeded` and the
     * order to `paid`, so this record never invents its own copy of that move.
     */
    upsertOffline: (orderId, userId, data) =>
        upsertConfirmable(orderId, userId, {
            ...data,
            provider: 'manual',
            status: 'requires_confirmation',
            // A card attempt's leftovers: this row is now the hand-paid one.
            providerRef: undefined,
            cardLast4: undefined
        }),

    /**
     * The status-machine primitive, same shape as the order repository's: the `$in` rides in
     * the filter so exactly one of two racing writes matches. `session` joins the write to the
     * caller's transaction — the outbox row announcing the move rides in the same one.
     */
    updateStatusIfIn: (orderId, from, to, extra = {}, session) =>
        paymentModel
            .findOneAndUpdate(
                { orderId: toObjectId(orderId), status: { $in: [...from] } },
                { $set: { status: to, ...extra } },
                { returnDocument: 'after', ...(session ? { session } : {}) }
            )
            .exec(),

    /**
     * Unset `userId` on every payment this account made. No `anonymizeAfter` scheduling needed,
     * unlike `orders`: nothing else on a SETTLED payment is personal data. {@link
     * deleteAbandonedBefore} runs on its own timer below, but for a different reason entirely —
     * it deletes attempts that never settled, not PII on ones that did.
     *
     * @param userId - the erased account's id
     * @returns how many payments were detached
     */
    detachUserId: (userId: string, session?: ClientSession) =>
        paymentModel
            .updateMany(
                { userId: toObjectId(userId) },
                { $unset: { userId: 1 } },
                { timestamps: false, ...(session ? { session } : {}) }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount),

    /**
     * Delete every payment attempt that never became money and has sat untouched since before
     * `cutoff` — `scripts/ops/reap-payments.ts`'s sweep. `succeeded` and `refunded` are excluded no
     * matter how old: those are invoices, kept forever like `orders`' own records, not attempts.
     * See `docs/modules/payments.md`'s retention section for the reasoning.
     *
     * @param cutoff - payments last touched at or before this instant are due
     * @returns how many were deleted
     */
    deleteAbandonedBefore: (cutoff: Date) =>
        paymentModel
            .deleteMany({
                status: { $nin: [PaymentStatus.succeeded, PaymentStatus.refunded] },
                updatedAt: { $lte: cutoff }
            })
            .exec()
            .then(({ deletedCount }) => deletedCount),

    /**
     * Open a refund: append its record and raise `amountRefunded` in ONE write, conditional on the
     * payment still being `succeeded` and `amountRefunded` still being what the caller read. That
     * condition is the whole race guard — two partial refunds computed from the same read cannot
     * both land, so the total can never pass what was paid. The caller re-reads and re-checks on a
     * miss.
     *
     * The new total arrives computed, not `$inc`-ed: it is summed in integer minor units by the
     * caller, where a float `$inc` would drift (0.1 + 0.2).
     *
     * @param paymentId - the payment
     * @param expectedRefunded - `amountRefunded` as the caller read it
     * @param newRefunded - `amountRefunded` once this refund is counted
     * @param refund - the record to append
     * @param session - the caller's transaction, when the timeline row must commit with it
     * @returns the payment as it now stands, or `null` if the guard no longer held
     */
    addRefund: (paymentId, expectedRefunded, newRefunded, refund, session) =>
        paymentModel
            .findOneAndUpdate(
                {
                    _id: toObjectId(paymentId),
                    status: 'succeeded',
                    amountRefunded: expectedRefunded
                },
                { $set: { amountRefunded: newRefunded }, $push: { refunds: refund } },
                { returnDocument: 'after', ...(session ? { session } : {}) }
            )
            .exec(),

    /**
     * Mark one refund `succeeded`, only if it is still open (`pending` or `failed`) — the
     * conditional write that makes a settled refund settle exactly once, however many callers (the
     * request, the sweep) race to finish it. A `null` answer means someone else already did.
     *
     * @param paymentId - the payment
     * @param refundId - the refund record inside it
     * @param fields - the provider's refund id when there was one, and `refundedByHand` for money
     *   an operator returned outside the application
     * @param session - the caller's transaction, when the settlement is announced through the outbox
     * @returns the payment as it now stands, or `null` if that refund was not open
     */
    settleRefund: (paymentId, refundId, fields, session) =>
        paymentModel
            .findOneAndUpdate(
                {
                    _id: toObjectId(paymentId),
                    refunds: {
                        $elemMatch: {
                            _id: toObjectId(refundId),
                            status: { $in: OPEN_REFUND_STATUSES }
                        }
                    }
                },
                {
                    $set: {
                        'refunds.$.status': 'succeeded',
                        'refunds.$.settledAt': new Date(),
                        ...(fields.providerRefundRef === undefined
                            ? {}
                            : { 'refunds.$.providerRefundRef': fields.providerRefundRef }),
                        ...(fields.refundedByHand ? { refundedByHand: true } : {})
                    },
                    $unset: { 'refunds.$.failureReason': 1 }
                },
                { returnDocument: 'after', ...(session ? { session } : {}) }
            )
            .exec(),

    /**
     * Record that the provider refused a refund, keeping it open for the sweep. Only an open one
     * can fail — a refund that already succeeded is never walked back by a late error.
     *
     * @param paymentId - the payment
     * @param refundId - the refund record inside it
     * @param failureReason - the closed code for what the provider said
     * @param session - the caller's transaction, when the timeline row must commit with it
     * @returns the payment as it now stands, or `null` if that refund was not open
     */
    failRefund: (paymentId, refundId, failureReason, session) =>
        paymentModel
            .findOneAndUpdate(
                {
                    _id: toObjectId(paymentId),
                    refunds: {
                        $elemMatch: {
                            _id: toObjectId(refundId),
                            status: { $in: OPEN_REFUND_STATUSES }
                        }
                    }
                },
                {
                    $set: { 'refunds.$.status': 'failed', 'refunds.$.failureReason': failureReason }
                },
                { returnDocument: 'after', ...(session ? { session } : {}) }
            )
            .exec(),

    /**
     * One page of the staff payments list, as documents the presenter serializes. `label` is {@link displayStatusFilter}'s query, when asked for.
     *
     * @param filters - the validated filter bag, `page`/`pageSize`/`sort` included
     * @param label - the stored-field query behind the `displayStatus` filter
     * @param scope - the caller's read scope
     */
    searchStaff: async (filters, label, scope) => {
        const pagination = normalizePagination(filters);
        const chosen = sortOf(filters, PAYMENT_SORTABLE);
        const where = withScope(
            // `$and`, not a spread: the label may carry its own `$and` and `refunds` keys.
            label ? { $and: [base.buildWhere(filters), label] } : base.buildWhere(filters),
            scope
        );
        const totalItems = await base.count(where);
        // Hydrated, not lean: the presenter serializes a document the one way everywhere, and the
        // provider ids it adds for staff are read off the document, not off a mutated lean row.
        const query = paymentModel
            .find(where)
            .sort(chosen ?? DEFAULT_SORT)
            .skip(pagination.skip)
            .limit(pagination.pageSize);
        // Query#collation: text order for a caller-chosen sort, as every other list.
        const items = await (chosen ? query.collation(SORT_COLLATION) : query).exec();
        return { items, meta: buildPaginatedMeta(pagination, totalItems) };
    },

    /**
     * Payments created in the window that took money, grouped by method, provider and currency.
     * @param window - createdAt bounds
     */
    sumMix: (window) =>
        aggregatePayments<MixSums>([
            {
                $match: {
                    status: { $in: [PaymentStatus.succeeded, PaymentStatus.refunded] },
                    createdAt: { $gte: window.from, $lt: window.to }
                }
            },
            {
                $group: {
                    _id: { method: '$method', provider: '$provider', currency: '$currency' },
                    payments: { $sum: 1 },
                    amount: decimalSum('$amount')
                }
            }
        ]),

    /**
     * One page of refunds across every payment, newest first — the Refunds tab. The `$match` on
     * `refunds.status` before the `$unwind` is what lets the compound index serve it.
     *
     * @param filters - status, reason, order and date bounds, with the page
     */
    searchRefunds: async (filters) => {
        const pagination = normalizePagination(filters);
        const base: PipelineStage[] = [
            {
                $match: {
                    ...(filters.orderId ? { orderId: toObjectId(filters.orderId) } : {}),
                    ...refundMatch(filters)
                }
            },
            { $unwind: '$refunds' },
            { $match: refundMatch(filters) }
        ];
        const [counted, items] = await Promise.all([
            aggregatePayments<{ totalItems: number }>([...base, { $count: 'totalItems' }]),
            aggregatePayments<RefundRow>([
                ...base,
                { $sort: { 'refunds.createdAt': -1, 'refunds._id': -1, _id: -1 } },
                { $skip: pagination.skip },
                { $limit: pagination.pageSize },
                REFUND_ROW_PROJECTION
            ])
        ]);
        return { items, meta: buildPaginatedMeta(pagination, counted.at(0)?.totalItems ?? 0) };
    },

    /**
     * Refunds still open (`pending` or `failed`), oldest first — the needs-attention read. A
     * provider's open refund only counts once it is older than `openBefore`; a `manual` payment's
     * has no such grace, because nothing but the operator ever finishes it.
     *
     * @param options - which kind, the age cutoff for provider refunds, and the cap
     */
    findOpenRefundRows: ({ manual, openBefore, limit }) =>
        aggregatePayments<RefundRow>([
            {
                $match: {
                    provider: manual ? 'manual' : { $ne: 'manual' },
                    'refunds.status': { $in: [...OPEN_REFUND_STATUSES] }
                }
            },
            { $unwind: '$refunds' },
            {
                $match: {
                    'refunds.status': { $in: [...OPEN_REFUND_STATUSES] },
                    ...(openBefore ? { 'refunds.createdAt': { $lte: openBefore } } : {})
                }
            },
            { $sort: { 'refunds.createdAt': 1, 'refunds._id': 1, _id: 1 } },
            { $limit: limit },
            REFUND_ROW_PROJECTION
        ]),

    /**
     * Payments with a refund still open, oldest first — the refund sweep's own scan.
     * `updatedBefore` keeps it off a refund whose request is still in flight this very second.
     *
     * @param updatedBefore - only payments untouched since at least this instant
     * @param limit - how many to return at most
     * @returns the payments to retry
     */
    findWithOpenRefunds: (updatedBefore: Date, limit: number) =>
        paymentModel
            .find({
                refunds: { $elemMatch: { status: { $in: OPEN_REFUND_STATUSES } } },
                updatedAt: { $lte: updatedBefore }
            })
            .sort({ updatedAt: 1 })
            .limit(limit)
            .exec(),

    /**
     * Payments the provider may have moved on without this application hearing of it: still in a
     * state a settlement moves away from, holding an intent to ask about, and untouched since
     * `updatedBefore`. A `manual` payment has no provider to ask. Oldest first, so a capped batch
     * reaches the longest-waiting ones; a payment that is asked and still unsettled is rewritten
     * by the settlement, which moves it to the back of the line.
     *
     * @param updatedBefore - payments last touched at or before this instant are due
     * @param limit - the most to return
     */
    findStaleInFlight: (updatedBefore: Date, limit: number) =>
        paymentModel
            .find({
                status: { $in: [...SETTLEABLE_PAYMENT_STATUSES] },
                providerRef: { $exists: true, $ne: null },
                provider: { $ne: 'manual' },
                updatedAt: { $lte: updatedBefore }
            })
            .sort({ updatedAt: 1 })
            .limit(limit)
            .exec()
};
