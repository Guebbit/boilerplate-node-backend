/**
 * @module
 * The one place a return document becomes the `Return` contract. The read service builds on this
 * to add the `actions` a caller may take.
 */

import type { Return, ReturnActions, ReturnListItem } from '@types';
import type { ReturnDocument } from './model';

/** A return as stored and read back: the contract's `Return` before the caller's `actions`. */
export type StoredReturn = Omit<Return, 'actions'>;

/**
 * `.toJSON()` applies the model's transform: `_id` → `id`, `__v` and `shippingRefund` dropped,
 * Decimal128 → string. Dates and ObjectIds stay as they are; `JSON.stringify` turns them into
 * strings on the wire. The document is typed as stored, not as the wire shape `Return` promises.
 */
export const presentReturn = (document: ReturnDocument): StoredReturn =>
    document.toJSON() as StoredReturn;

/**
 * One row of a returns list: only what the table renders. The customer's note, staff's decline
 * message and the lines are the audited detail read's.
 *
 * @param returned - the return as stored and read back
 * @param actions - what the requesting caller may do to it
 */
export const presentReturnListItem = (
    returned: StoredReturn,
    actions: ReturnActions
): ReturnListItem => ({
    id: returned.id,
    orderId: returned.orderId,
    orderNumber: returned.orderNumber,
    status: returned.status,
    reason: returned.reason,
    kind: returned.kind,
    requestedAt: returned.requestedAt,
    createdAt: returned.createdAt,
    actions
});
