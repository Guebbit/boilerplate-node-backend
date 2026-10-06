/**
 * @module
 * Who owns an order, as `returns` asks it: the one question `createReturn` and `getReturn` both
 * put before touching a return.
 */

import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type { AuthContext } from '@types';

/**
 * The buyer's own order, or `undefined`. Ownership, not just visibility: an operator who can read
 * any order still cannot exercise a consumer's right on their behalf.
 * @param orderId - the order
 * @param authContext - the caller
 */
export const ownOrder = (
    orderId: string,
    authContext: AuthContext
): Promise<OrderDocument | undefined> =>
    orderService
        .getForCaller(orderId, authContext)
        .then((order) => (order && String(order.userId) === authContext.id ? order : undefined));
