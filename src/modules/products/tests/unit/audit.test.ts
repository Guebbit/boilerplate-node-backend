/**
 * @module
 * The audit vocabulary this module emits — `src/modules/products/audit.ts`.
 *
 * Pinned string by string: the STRING is a wire contract read by log queries and alerts
 * outside this repo, not refactored alongside a renamed constant. `tests/cross-cutting/
 * audit-actions.test.ts` proves the SHAPE of every module's vocabulary but can't assert
 * values without naming every domain — so each owner asserts its own here, by whole-object
 * equality, which also catches an action added or removed without being written down.
 */

import type { AuditAction } from '@infrastructure/observability/audit';
import { productsAuditActions } from '../../audit';

describe('the products audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(productsAuditActions).toEqual({
            ADMIN_PRODUCT_CREATED: 'admin.product.created',
            ADMIN_PRODUCT_UPDATED: 'admin.product.updated',
            ADMIN_PRODUCT_DELETED: 'admin.product.deleted'
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
        const action: AuditAction = productsAuditActions.ADMIN_PRODUCT_CREATED;

        expect(action).toBe('admin.product.created');
    });
});
