/**
 * @module
 * Who may cancel a remainder, as ONE rule for its two askers: the door that refuses
 * (`cancel-remainder.ts`) and the options read that offers (`options.ts`). Two copies would let the
 * button promise what the door then refuses.
 *
 * See: docs/modules/returns.md#cancelling-what-has-not-shipped
 */

import { callerForSubject } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import {
    hasShopStarted,
    isBuyer,
    isExcludedFromWithdrawal,
    withdrawalClosesAt
} from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type { AuthContext } from '@types';
import type { ProductQuantity } from '../domain';

/** Why a caller may not cancel a remainder: the buyer's two limits, or staff without the refund key. */
export type CancelRefusal = 'window-closed' | 'excluded' | 'no-key';

/**
 * The first reason this caller may not cancel this remainder, or `undefined` when they may.
 *
 * The order's buyer exercises their withdrawal within its window, even when they are staff. A group
 * holding goods Art. 16 excludes (made to order) may only go while the shop has not started on the
 * order — `paid`; once it is `processing` that group is the shop's work and stays. Anyone else
 * needs the refund key (`create:Refund`). Staff recording a withdrawal the buyer stated outside the
 * shop are held to the same two limits as the buyer, judged on the day it was stated.
 *
 * @param order - the order
 * @param authContext - the caller
 * @param remainder - the lines of the fulfillment order being cancelled
 * @param statedAt - when the buyer stated the withdrawal: set by staff recording one, absent for
 *   the buyer (now) and for staff cancelling for their own reasons (no withdrawal to judge)
 */
export const cancelRefusalOf = (
    order: OrderDocument,
    authContext: AuthContext,
    remainder: readonly ProductQuantity[],
    statedAt?: Date
): CancelRefusal | undefined => {
    const buyer = isBuyer(order, authContext);
    if (!buyer && !holds(callerForSubject(authContext, 'Refund'), 'create', 'Refund'))
        return 'no-key';
    if (!buyer && statedAt === undefined) return undefined;

    const at = statedAt ?? new Date();
    if (order.withdrawUntil && at.getTime() > withdrawalClosesAt(order.withdrawUntil).getTime())
        return 'window-closed';

    if (!hasShopStarted(order.status)) return undefined;

    const excluded = new Set(
        order.items
            .filter((item) => isExcludedFromWithdrawal(item))
            .map((item) => String(item.product._id))
    );
    return remainder.some(({ productId }) => excluded.has(productId)) ? 'excluded' : undefined;
};
