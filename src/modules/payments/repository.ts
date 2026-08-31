/**
 * @module
 * Standard CRUD via the repository factory, plus the two lookups and the one guarded write payments
 * actually take.
 *
 * `unique` on `orderId` makes "one payment per order" a database fact, so the intent upsert is
 * a single `findOneAndUpdate({ orderId }, …, { upsert: true })` with no read in front of it.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 */

import { paymentModel, applyPaymentTransform } from './model';
import type { PaymentStatus } from '@types';
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
    upsertIntent: (
        orderId: string,
        userId: string,
        data: { amount: number; currency: string; provider: string }
    ) => Promise<PaymentDocument | null>;
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
     * Restrict a query to one user's own payments.
     *
     * The counterpart of `orders`' `ownerScope`, and it lives here for the same reason: which
     * *rows* exist for a given audience is a rule about the collection, not about a request.
     * Callers spread it (`{ ...ownerScope(id) }`) and admins pass nothing, which is how they read
     * anyone's.
     *
     * @param userId - the caller's id
     * @returns the filter fragment restricting a query to their payments
     */
    ownerScope: (userId: string) => ({ userId: toObjectId(userId) }),

    /**
     * One payment by its own id, optionally restricted to a caller's own rows.
     *
     * Scoped in the FILTER rather than checked after the read — `orders/repository.ts` states why:
     * checking ownership after the read is how a scoped find turns into an information leak, and
     * it leaves a window between the check and whatever uses the document.
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
     * Create or refresh the intent for an order. Re-asking for an intent is the double-click
     * case, not an error: the amount is re-frozen (the cart may have been edited through
     * another order's lifecycle) and the status returns to `requires_confirmation` — but ONLY
     * from a state where nobody has paid, which the `$in` guard enforces the same way the
     * order's own status machine does.
     *
     * When the payment exists in a state past confirmation (`succeeded`, `refunded`) the filter
     * misses and the upsert collides with the unique index instead — that duplicate key IS the
     * answer "this order's money already moved", surfaced as `null` rather than an exception.
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
                    $setOnInsert: { userId: toObjectId(userId) }
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
            .exec()
};
