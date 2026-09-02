/**
 * @module
 * The audit vocabulary this module emits (`src/modules/users/audit.ts`). Pinned string by
 * string, since each action is a wire contract read by log queries, dashboards and alerts
 * outside this repo — asserted here by whole-object equality so an added, removed or changed
 * action fails the test.
 */

import { usersAuditActions } from '../../audit';

describe('the users audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(usersAuditActions).toEqual({
            ADMIN_USER_CREATED: 'admin.user.created',
            ADMIN_USER_UPDATED: 'admin.user.updated',
            ADMIN_USER_SOFT_DELETED: 'admin.user.soft_deleted',
            ADMIN_USER_ERASED: 'admin.user.erased',
            ADMIN_USER_2FA_DISABLED: 'admin.user.two_factor_disabled'
        });
    });
});
