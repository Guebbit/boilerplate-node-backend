/**
 * @module
 * The audit vocabulary this module emits (`src/modules/users/audit.ts`). Pinned string by
 * string, since each action is a wire contract read by log queries, dashboards and alerts
 * outside this repo — asserted here by whole-object equality so an added, removed or changed
 * action fails the test.
 */

import type { AuditAction } from '@infrastructure/observability/audit';
import { usersAuditActions } from '../../audit';

describe('the users audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(usersAuditActions).toEqual({
            ADMIN_USER_CREATED: 'admin.user.created',
            ADMIN_USER_UPDATED: 'admin.user.updated',
            ADMIN_USER_DELETED: 'admin.user.deleted'
        });
    });

    /*
     * `declare module` in `audit.ts` puts these actions into `AuditAction`; without it the module
     * still compiles but `emitAuditEvent` rejects them at call sites. Checked at type-check time
     * only — jest itself doesn't type-check this line, but `tsconfig.json` compiles it.
     */
    it('registers its actions in the app-wide union', () => {
        const action: AuditAction = usersAuditActions.ADMIN_USER_CREATED;

        expect(action).toBe('admin.user.created');
    });
});
