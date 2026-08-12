/**
 * The audit vocabulary this module emits — `src/modules/products/audit.ts`.
 *
 * Pinned string by string, because an action is a WIRE CONTRACT and not an identifier. The
 * constant's NAME is this codebase's business and renaming it is a refactor; the STRING is read by
 * log queries, dashboards and alert rules that live outside this repo and are not refactored with
 * it. Change one and everything here type-checks, every other test passes, and someone's alert
 * quietly stops firing.
 *
 * `tests/cross-cutting/audit-actions.test.ts` proves the SHAPE of every module's vocabulary —
 * present, unique across modules, spelled as dotted lower snake_case. It cannot assert the values
 * without naming every domain, which is the coupling the module layout removes. So the values are
 * asserted by their owner, and deleting this folder takes them with it.
 *
 * Whole-object equality rather than one assertion per key: it fails on a changed value AND on an
 * action added or removed without the decision being written down here.
 */

import type { TAuditAction } from '@infrastructure/observability/audit';
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
     * The `declare module` augmentation in `audit.ts` is what puts these into `TAuditAction`.
     * Drop it and the module still compiles on its own — but `emitAuditEvent` then rejects every
     * action this module owns, at the call sites rather than here. Checked at type-check time:
     * `tsconfig.json` includes the whole `src` tree, so this line is compiled even though jest
     * does not type-check it.
     */
    it('registers its actions in the app-wide union', () => {
        const action: TAuditAction = productsAuditActions.ADMIN_PRODUCT_CREATED;

        expect(action).toBe('admin.product.created');
    });
});
