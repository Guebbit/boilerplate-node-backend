/**
 * @module
 * The audit vocabulary this module emits — `src/modules/orders/audit.ts`. Pinned string by
 * string, since an action is a WIRE CONTRACT read by log queries and alert rules outside this
 * repo, not just an identifier. Whole-object equality catches both a changed value and an action
 * added or removed undocumented.
 */

import { ordersAuditActions } from '../../audit';

describe('the orders audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(ordersAuditActions).toEqual({
            ORDER_CREATED: 'order.created',
            ORDER_UPDATED: 'order.updated',
            ORDER_DELETED: 'order.deleted',
            ORDER_CANCELLED: 'order.cancelled'
        });
    });
});
