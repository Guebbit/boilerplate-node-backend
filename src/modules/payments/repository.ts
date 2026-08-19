import { paymentModel, applyPaymentTransform } from './model';
import type { PaymentStatus } from '@types';
import type { PaymentDocument } from './model';
import {
    createBaseRepository,
    toObjectId,
    type BaseRepository
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
 * an inferred one at an export boundary (TS7056) — the same reason `BaseRepository` exists.
 */
export const paymentRepository: BaseRepository<PaymentDocument> & {
    findByOrderId: (orderId: string) => Promise<PaymentDocument | null>;
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
    ...createBaseRepository<PaymentDocument>(paymentModel, {
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
