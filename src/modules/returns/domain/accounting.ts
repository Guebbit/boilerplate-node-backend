/**
 * @module
 * Which units of an order are already accounted for — cancelled before they shipped, or back —
 * and how much delivery has already been refunded. Pure, so the rule behind "shipping is refunded
 * by whichever cancel or return takes the LAST unit" is testable without a database.
 */

import { BACK_RETURN_STATUSES } from './lifecycle';
import type { ReturnKind, ReturnStatus } from './lifecycle';
import { wireLines } from './quantities';
import type { ProductQuantity } from './quantities';

/** A return as the accounting reads it. */
export interface AccountedReturn {
    kind: ReturnKind;
    status: ReturnStatus;
    lines: readonly { productId: { toString(): string }; quantity: number }[];
    /** The delivery inside what it refunded; absent on one that refunded none. */
    shippingRefund?: number | undefined;
}

/** What the order's other returns and cancels have already settled. */
export interface OrderAccounts {
    /** Units cancelled before they shipped, plus units that came back. */
    accountedFor: ProductQuantity[];
    /** The delivery already refunded, summed. */
    shippingRefunded: number;
}

/**
 * Whether a return's units are settled: a cancellation always is (born closed); a return only once
 * its goods are back — `received` or `closed`.
 * @param returned - the return
 */
const isSettled = (returned: AccountedReturn): boolean =>
    returned.kind === 'cancellation' || BACK_RETURN_STATUSES.includes(returned.status);

/**
 * Tally what the order's other returns and cancels have settled, so the one now being received or
 * made knows whether it takes the last unit and how much delivery is still owed.
 *
 * @param returns - every return on the order EXCEPT the one being settled now
 */
export const accountsOf = (returns: readonly AccountedReturn[]): OrderAccounts => {
    const settled = returns.filter((one) => isSettled(one));
    return {
        accountedFor: settled.flatMap(({ lines }) => wireLines(lines)),
        shippingRefunded: settled.reduce(
            (total, { shippingRefund }) => total + (shippingRefund ?? 0),
            0
        )
    };
};
