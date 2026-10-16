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
import { isBuyer, isExcludedFromWithdrawal } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type { AuthContext } from '@types';
import type { ProductQuantity } from '../domain';

/** Why a caller may not cancel a remainder: the buyer's two limits, or staff without the refund key. */
export type CancelRefusal = 'window-closed' | 'excluded' | 'no-key';

/**
 * The first reason this caller may not cancel this remainder, or `undefined` when they may.
 *
 * The order's buyer exercises their withdrawal (within its window, never on goods Art. 16
 * excludes), even when they are staff. Anyone else needs the refund key (`create:Refund`).
 *
 * @param order - the order
 * @param authContext - the caller
 * @param remainder - the lines of the fulfillment order being cancelled
 */
export const cancelRefusalOf = (
    order: OrderDocument,
    authContext: AuthContext,
    remainder: readonly ProductQuantity[]
): CancelRefusal | undefined => {
    if (!isBuyer(order, authContext))
        return holds(callerForSubject(authContext, 'Return'), 'create', 'Refund')
            ? undefined
            : 'no-key';

    if (order.withdrawUntil && Date.now() > order.withdrawUntil.getTime()) return 'window-closed';

    const excluded = new Set(
        order.items
            .filter((item) => isExcludedFromWithdrawal(item))
            .map((item) => String(item.product._id))
    );
    return remainder.some(({ productId }) => excluded.has(productId)) ? 'excluded' : undefined;
};
