/**
 * @module
 * Standard CRUD via the repository factory, plus the two lookups and the one guarded write payments
 * actually take. `unique` on `orderId` makes "one payment per order" a database fact, so the intent
 * upsert is a single `findOneAndUpdate` with no read in front of it. The return type is written out
 * because Mongoose's generics are too large for TypeScript to infer at an export boundary (TS7056).
 */

import type { ClientSession } from 'mongoose';
import { paymentModel, paymentWebhookEventModel, applyPaymentTransform } from './model';
import { PaymentStatus, PaymentMethod } from '@types';
import type { PaymentDocument, RefundRecord } from './model';
import { CONFIRMABLE_PAYMENT_STATUSES, OPEN_REFUND_STATUSES } from './domain';
import {
    createRepository,
    toObjectId,
    type Repository,
    type Wire
} from '@infrastructure/persistence/create-repository';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';

/**
 * `providerRef` and `pendingEffects` are what `applyPaymentTransform` omits — internal bookkeeping
 * never part of the wire contract — so the search wire type drops both too.
 */
export type PaymentWire = Omit<Wire<PaymentDocument>, 'providerRef' | 'pendingEffects'>;

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
 * `$set`/`$unset` and whose id lands on an insert.
 * @param orderId - the order the payment belongs to
 * @param userId - the payer to attach on INSERT only; absent writes no `userId` at all — an intent
 *   or offline record against an order whose account is already erased pays for real, with no
 *   payer to record
 * @param set - this caller's own `$set` fields
 * @param unset - this caller's own `$unset` fields, when it has any
 */
const upsertConfirmable = (
    orderId: string,
    userId: string | undefined,
    set: Record<string, unknown>,
    unset?: Record<string, 1>
): Promise<UpsertedPayment | null> =>
    paymentModel
        .findOneAndUpdate(
            {
                orderId: toObjectId(orderId),
                status: { $in: [...CONFIRMABLE_PAYMENT_STATUSES] }
            },
            {
                $set: set,
                ...(unset ? { $unset: unset } : {}),
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
    clearPendingEffects: (orderId: string) => Promise<void>;
    clearPendingEffectsOnce: (orderId: string, session: ClientSession) => Promise<boolean>;
    findWithPendingEffects: (updatedBefore: Date, limit: number) => Promise<PaymentDocument[]>;
    addRefund: (
        paymentId: string,
        expectedRefunded: number,
        newRefunded: number,
        refund: Pick<
            RefundRecord,
            '_id' | 'amount' | 'currency' | 'reason' | 'idempotencyKey' | 'status'
        >
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
        lastError: string
    ) => Promise<PaymentDocument | null>;
    findWithOpenRefunds: (updatedBefore: Date, limit: number) => Promise<PaymentDocument[]>;
} = {
    ...createRepository<PaymentDocument, PaymentWire>(paymentModel, {
        transform: applyPaymentTransform
    }),

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
        upsertConfirmable(
            orderId,
            userId,
            { ...data, provider: 'manual', status: 'requires_confirmation' },
            { providerRef: 1, cardLast4: 1 }
        ),

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
     * Drop the "an effect is still owed" marker — the effect ran (safe to repeat if it didn't
     * fully land), or the order it was for no longer needs it (lost to a cancel). Unconditional:
     * whichever of those it is, nothing is still relying on the marker once this is called.
     *
     * @param orderId - the order whose payment's marker is being cleared
     */
    clearPendingEffects: (orderId: string) =>
        paymentModel
            .updateOne(
                { orderId: toObjectId(orderId) },
                { $unset: { pendingEffects: 1 } },
                { timestamps: false }
            )
            .exec()
            .then(() => undefined),

    /**
     * Drop the marker inside the caller's transaction, and say whether THIS call was the one that
     * dropped it. Conditional on the marker still being there, so of two racers (a settlement and
     * the sweep finishing the same payment) exactly one sees `true` — the one that owes the
     * announcement, written to the outbox in that same transaction.
     *
     * @param orderId - the order whose payment's marker is being cleared
     * @param session - the transaction this write joins
     */
    clearPendingEffectsOnce: (orderId: string, session: ClientSession) =>
        paymentModel
            .updateOne(
                { orderId: toObjectId(orderId), pendingEffects: { $exists: true, $ne: [] } },
                { $unset: { pendingEffects: 1 } },
                { timestamps: false, session }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * Payments still owing an effect from a settlement that never finished it, oldest first —
     * `effects.ts#retryPendingEffects`'s own scan. `updatedBefore` excludes a payment whose
     * `succeeded` write is from this same sweep tick, so a settlement still mid-flight (between
     * setting the marker and clearing it) is never raced by the sweep that exists for the crash
     * case, not the normal one.
     *
     * @param updatedBefore - only markers at least this old
     * @param limit - how many to return at most, so one sweep can't try every stale payment at once
     */
    findWithPendingEffects: (updatedBefore: Date, limit: number) =>
        paymentModel
            .find({
                pendingEffects: { $exists: true, $ne: [] },
                updatedAt: { $lte: updatedBefore }
            })
            .sort({ updatedAt: 1 })
            .limit(limit)
            .exec(),

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
     * @returns the payment as it now stands, or `null` if the guard no longer held
     */
    addRefund: (paymentId, expectedRefunded, newRefunded, refund) =>
        paymentModel
            .findOneAndUpdate(
                {
                    _id: toObjectId(paymentId),
                    status: 'succeeded',
                    amountRefunded: expectedRefunded
                },
                { $set: { amountRefunded: newRefunded }, $push: { refunds: refund } },
                { returnDocument: 'after' }
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
                    $unset: { 'refunds.$.lastError': 1 }
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
     * @param lastError - what the provider said
     * @returns the payment as it now stands, or `null` if that refund was not open
     */
    failRefund: (paymentId, refundId, lastError) =>
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
                { $set: { 'refunds.$.status': 'failed', 'refunds.$.lastError': lastError } },
                { returnDocument: 'after' }
            )
            .exec(),

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
            .exec()
};

/**
 * Claim a webhook event id for processing.
 *
 * The INSERT is the check. A read followed by a write is a race two concurrent deliveries can both
 * pass; the unique index refuses exactly one of them, whichever arrives second.
 *
 * @param eventId - the provider's event id
 * @returns `true` when this delivery is the first to claim it, `false` when it is a retry of one
 *   already acted on — in which case the caller must answer 2xx and do nothing else
 */
export const claimWebhookEvent = (eventId: string): Promise<boolean> =>
    paymentWebhookEventModel
        .create({ eventId })
        .then(() => true)
        .catch((error: unknown) => {
            if (isDuplicateKey(error)) return false;
            throw error;
        });

/**
 * Give a claimed event id back, so the provider's next delivery of it is acted on.
 *
 * The compensating half of {@link claimWebhookEvent}. A settlement that failed has NOT been
 * applied, and a claim left standing over it turns every future redelivery into a silent no-op —
 * which is the one outcome the ledger exists to prevent.
 *
 * @param eventId - the provider's event id
 */
export const releaseWebhookEvent = (eventId: string): Promise<void> =>
    paymentWebhookEventModel
        .deleteOne({ eventId })
        .exec()
        .then(() => undefined);
