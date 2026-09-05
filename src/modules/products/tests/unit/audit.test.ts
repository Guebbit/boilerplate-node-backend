/**
 * @module
 * The audit vocabulary this module emits — `src/modules/products/audit.ts`. Pinned string by
 * string, since the STRING is a wire contract read by log queries and alerts outside this repo,
 * not refactored alongside a renamed constant. Asserted here by whole-object equality, which
 * also catches an action added or removed without being written down.
 */

import { productsAuditActions } from '../../audit';

describe('the products audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(productsAuditActions).toEqual({
            ADMIN_PRODUCT_CREATED: 'admin.product.created',
            ADMIN_PRODUCT_UPDATED: 'admin.product.updated',
            ADMIN_PRODUCT_DELETED: 'admin.product.deleted'
        });
    });
});
