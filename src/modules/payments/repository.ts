/**
 * @module
 * Standard CRUD via the repository factory, plus the two lookups and the one guarded write payments
 * actually take. `unique` on `orderId` makes "one payment per order" a database fact, so the intent
 * upsert is a single `findOneAndUpdate` with no read in front of it. The return type is written out
 * because Mongoose's generics are too large for TypeScript to infer at an export boundary (TS7056).
 */

import { paymentModel, paymentWebhookEventModel, applyPaymentTransform } from './model';
import { PaymentStatus } from '@types';
import type { PaymentDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';

/** Payment CRUD, ownership scoping, and the intent/status writes the service depends on. */
export const paymentRepository: Repository<PaymentDocument> & {
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
    ) => Promise<PaymentDocument | null>;
    detachUserId: (userId: string) => Promise<number>;
    deleteAbandonedBefore: (cutoff: Date) => Promise<number>;
    updateStatusIfIn: (
        orderId: string,
        from: readonly PaymentStatus[],
        to: PaymentStatus,
        extra?: Partial<PaymentDocument>
    ) => Promise<PaymentDocument | null>;
} = {
    ...createRepository<PaymentDocument>(paymentModel, {
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
        paymentModel
            .findOneAndUpdate(
                {
                    orderId: toObjectId(orderId),
                    status: { $in: ['requires_confirmation', 'declined'] }
                },
                {
                    $set: { ...data, status: 'requires_confirmation' },
                    // Absent rather than `toObjectId(undefined)`: an intent against an order
                    // whose account is already erased pays for real, with no payer to record.
                    $setOnInsert: userId === undefined ? {} : { userId: toObjectId(userId) }
                },
                { upsert: true, returnDocument: 'after' }
            )
            .exec()
            .catch((error: { code?: number }) => {
                if (error.code === 11_000) return null;
                throw error;
            }),

    /**
     * The status-machine primitive, same shape as the order repository's: the `$in` rides in
     * the filter so exactly one of two racing writes matches.
     */
    updateStatusIfIn: (orderId, from, to, extra = {}) =>
        paymentModel
            .findOneAndUpdate(
                { orderId: toObjectId(orderId), status: { $in: [...from] } },
                { $set: { status: to, ...extra } },
                { returnDocument: 'after' }
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
    detachUserId: (userId: string) =>
        paymentModel
            .updateMany(
                { userId: toObjectId(userId) },
                { $unset: { userId: 1 } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount),

    /**
     * Delete every payment attempt that never became money and has sat untouched since before
     * `cutoff` — `ops/reap-payments.ts`'s sweep. `succeeded` and `refunded` are excluded no
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
            .then(({ deletedCount }) => deletedCount)
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
        .catch((error: { code?: number }) => {
            if (error.code === 11_000) return false;
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
