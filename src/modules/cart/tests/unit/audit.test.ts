/**
 * @module
 * The audit vocabulary this module emits — `src/modules/cart/audit.ts`. Pinned string by string:
 * the action is a WIRE CONTRACT, not an identifier — renaming the constant type-checks and passes
 * every other test while quietly breaking log queries and alert rules, so each value is asserted
 * by its owner. Whole-object equality also fails on an action added or removed unnoticed.
 */

import type { AuditAction } from '@infrastructure/observability/audit';
import { cartAuditActions } from '../../audit';

describe('the cart audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(cartAuditActions).toEqual({
            USER_CART_ITEM_REMOVED: 'user.cart.item_removed',
            USER_CART_REORDERED: 'user.cart.reordered'
        });
    });

    /*
     * The `declare module` augmentation in `audit.ts` puts these into `AuditAction`. Drop it and
     * the module still compiles alone, but `emitAuditEvent` then rejects every action it owns —
     * at the call sites, not here. Checked at type-check time even though jest itself does not.
     */
    it('registers its actions in the app-wide union', () => {
        const action: AuditAction = cartAuditActions.USER_CART_ITEM_REMOVED;

        expect(action).toBe('user.cart.item_removed');
    });
});
