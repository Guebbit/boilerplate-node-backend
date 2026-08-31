/**
 * @module
 * The audit vocabulary this module emits — `src/modules/orders/audit.ts`.
 *
 * Pinned string by string, because an action is a WIRE CONTRACT, not an identifier: the STRING is
 * read by log queries, dashboards and alert rules outside this repo, which a mere rename would
 * silently break. `tests/cross-cutting/audit-actions.test.ts` proves the shape of every module's
 * vocabulary; the values themselves are asserted here, by their owner.
 *
 * Whole-object equality catches a changed value AND an action added or removed undocumented.
 */

import type { AuditAction } from '@infrastructure/observability/audit';
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

    /*
     * The `declare module` augmentation in `audit.ts` is what puts these into `AuditAction`.
     * Drop it and the module still compiles on its own — but `emitAuditEvent` then rejects every
     * action this module owns, at the call sites rather than here. Checked at type-check time:
     * `tsconfig.json` includes the whole `src` tree, so this line is compiled even though jest
     * does not type-check it.
     */
    it('registers its actions in the app-wide union', () => {
        const action: AuditAction = ordersAuditActions.ORDER_CREATED;

        expect(action).toBe('order.created');
    });
});
