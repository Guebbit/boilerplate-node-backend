/**
 * @module
 * Who may open a return on an order, as `returns` asks it: the one question `createReturn` and
 * `getReturn` both put before touching a return.
 */

import { callerForSubject } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import { isBuyer, orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type { AuthContext } from '@types';

/** An order a caller may open a return on, and whether staff do it on the buyer's behalf. */
export interface OpenableOrder {
    order: OrderDocument;
    /** `true` when the caller is not the buyer but holds `update:Return` and acts for them. */
    byStaff: boolean;
}

/**
 * The buyer's own order, or `undefined`. Ownership, not just visibility: an operator who can read
 * any order is not its buyer. Acting FOR the buyer is a separate door, {@link openableOrder}.
 * @param orderId - the order
 * @param authContext - the caller
 */
export const ownOrder = (
    orderId: string,
    authContext: AuthContext
): Promise<OrderDocument | undefined> =>
    orderService
        .getForCaller(orderId, authContext)
        .then((order) => (order && isBuyer(order, authContext) ? order : undefined));

/**
 * The order a caller may open a return on: their own, or — for a caller holding `update:Return` —
 * anyone's, on the buyer's behalf (the phone call that asks for it). A staff member buying for
 * themselves is a buyer first. Anyone else gets `undefined`, which the door answers as 404.
 * @param orderId - the order
 * @param authContext - the caller
 */
export const openableOrder = (
    orderId: string,
    authContext: AuthContext
): Promise<OpenableOrder | undefined> =>
    ownOrder(orderId, authContext).then((own) => {
        if (own) return { order: own, byStaff: false };
        if (!holds(callerForSubject(authContext, 'Return'), 'update', 'Return')) return undefined;

        return orderService
            .getById(orderId)
            .then((order) => (order ? { order, byStaff: true } : undefined));
    });
