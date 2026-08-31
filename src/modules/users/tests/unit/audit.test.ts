/**
 * @module
 * The audit vocabulary this module emits — `src/modules/users/audit.ts`.
 *
 * Pinned string by string: an action is a WIRE CONTRACT, not an identifier — the string is read
 * by log queries, dashboards and alerts outside this repo that a rename would silently break.
 * Values are asserted here by their owner, since the cross-cutting shape test only checks
 * presence and naming, not content. Whole-object equality so an action added or removed fails
 * too, not just a changed one.
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
     * The `declare module` augmentation in `audit.ts` is what puts these into `AuditAction`.
     * Drop it and the module still compiles on its own — but `emitAuditEvent` then rejects every
     * action this module owns, at the call sites rather than here. Checked at type-check time:
     * `tsconfig.json` includes the whole `src` tree, so this line is compiled even though jest
     * does not type-check it.
     */
    it('registers its actions in the app-wide union', () => {
        const action: AuditAction = usersAuditActions.ADMIN_USER_CREATED;

        expect(action).toBe('admin.user.created');
    });
});
