import { paymentModel, applyPaymentTransform } from './model';
import type { IPaymentDocument, TPaymentStatus } from './model';
import {
    createBaseRepository,
    toObjectId,
    type IBaseRepository
} from '@infrastructure/persistence/base-repository';

/**
 * Payment Repository
 * Standard CRUD via the base factory, plus the two lookups and the one guarded write payments
 * actually take.
 *
 * `unique` on `orderId` makes "one payment per order" a database fact, so the intent upsert is
 * a single `findOneAndUpdate({ orderId }, …, { upsert: true })` with no read in front of it.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `IBaseRepository` exists.
 */
export const paymentRepository: IBaseRepository<IPaymentDocument> & {
    findByOrderId: (orderId: string) => Promise<IPaymentDocument | null>;
    upsertIntent: (
        orderId: string,
        userId: string,
        data: { amount: number; currency: string; provider: string }
    ) => Promise<IPaymentDocument | null>;
    updateStatusIfIn: (
        orderId: string,
        from: readonly TPaymentStatus[],
        to: TPaymentStatus,
        extra?: Partial<IPaymentDocument>
    ) => Promise<IPaymentDocument | null>;
} = {
    ...createBaseRepository<IPaymentDocument>(paymentModel, {
        transform: applyPaymentTransform
    }),

    /** The payment behind an order, or `null` when no intent was ever created. */
    findByOrderId: (orderId: string) =>
        paymentModel.findOne({ orderId: toObjectId(orderId) }).exec(),

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
