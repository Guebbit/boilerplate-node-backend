/**
 * @module
 * The audit vocabulary this module emits — `src/modules/products/audit.ts`. Pinned string by
 * string, since the STRING is a wire contract read by log queries and alerts outside this repo,
 * not refactored alongside a renamed constant. Asserted here by whole-object equality, which
 * also catches an action added or removed without being written down.
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
     * `declare module` in audit.ts feeds these into `AuditAction`; drop it and `emitAuditEvent`
     * fails to type-check at every call site. Caught only by `tsc`, not by jest — this line
     * exists to fail CI, not to assert at runtime.
     */
    it('registers its actions in the app-wide union', () => {
        const action: AuditAction = productsAuditActions.ADMIN_PRODUCT_CREATED;

        expect(action).toBe('admin.product.created');
    });
});
