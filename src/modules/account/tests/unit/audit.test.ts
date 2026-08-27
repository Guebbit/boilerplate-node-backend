/**
 * The audit vocabulary this module emits — `src/modules/account/audit.ts`.
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

import type { AuditAction } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../../audit';

describe('the account audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(accountAuditActions).toEqual({
            AUTH_LOGIN: 'auth.login',
            AUTH_SIGNED_UP: 'auth.signup',
            AUTH_PROFILE_UPDATED: 'auth.profile.updated',
            AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
            AUTH_PASSWORD_RESET_COMPLETED: 'auth.password_reset.completed',
            AUTH_PASSWORD_CHANGED: 'auth.password.changed',
            AUTH_ACCOUNT_DELETE_REQUESTED: 'auth.account_delete.requested',
            AUTH_ACCOUNT_DELETE_COMPLETED: 'auth.account_delete.completed',
            AUTH_EMAIL_VERIFY_REQUESTED: 'auth.email_verify.requested',
            AUTH_EMAIL_VERIFY_COMPLETED: 'auth.email_verify.completed',
            AUTH_TOKEN_REFRESHED: 'auth.token.refreshed',
            AUTH_LOGGED_OUT: 'auth.logout',
            AUTH_LOGGED_OUT_EVERYWHERE: 'auth.logout_all',
            AUTH_SESSION_REVOKED: 'auth.session.revoked',
            AUTH_TOKEN_EXPIRED_CLEANUP: 'auth.token.expired_cleanup'
        });
    });

    /*
     * The one module whose wire prefix and folder name deliberately disagree, which is why the
     * rule gets an assertion of its own rather than living only in the table above. A new action
     * added here as `account.*` would satisfy every other guard in the suite: the cross-cutting
     * sweep only asks that it be unique and lower snake_case.
     */
    it('keeps the `auth.` prefix the folder name does not control', () => {
        for (const action of Object.values(accountAuditActions))
            expect(action.startsWith('auth.')).toBe(true);
    });

    /*
     * The `declare module` augmentation in `audit.ts` is what puts these into `AuditAction`.
     * Drop it and the module still compiles on its own — but `emitAuditEvent` then rejects every
     * action this module owns, at the call sites rather than here. Checked at type-check time:
     * `tsconfig.json` includes the whole `src` tree, so this line is compiled even though jest
     * does not type-check it.
     */
    it('registers its actions in the app-wide union', () => {
        const action: AuditAction = accountAuditActions.AUTH_LOGIN;

        expect(action).toBe('auth.login');
    });
});
