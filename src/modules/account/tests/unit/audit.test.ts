/**
 * @module
 * The audit vocabulary this module emits (`audit.ts`). Pinned string by string: an action is a
 * WIRE CONTRACT, read by dashboards and alert rules outside this repo — renaming the constant is
 * a refactor, changing the string breaks something silently elsewhere.
 * `tests/cross-cutting/audit-actions.test.ts` proves the SHAPE across every module; it can't
 * assert values without naming every domain, so each owner asserts its own here.
 */

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
            AUTH_REFRESH_TOKEN_REUSE_DETECTED: 'auth.refresh_token.reuse_detected',
            AUTH_REAUTHENTICATED: 'auth.reauth',
            AUTH_LOGGED_OUT: 'auth.logout',
            AUTH_LOGGED_OUT_EVERYWHERE: 'auth.logout_all',
            AUTH_SESSION_REVOKED: 'auth.session.revoked',
            AUTH_TOKEN_EXPIRED_CLEANUP: 'auth.token.expired_cleanup',
            AUTH_DATA_EXPORTED: 'auth.data_export.completed',
            AUTH_2FA_ENROLLED: 'auth.two_factor.enrolled',
            AUTH_2FA_DISABLED: 'auth.two_factor.disabled',
            AUTH_2FA_CODE_SENT: 'auth.two_factor.code_sent',
            AUTH_2FA_CHALLENGE_FAILED: 'auth.two_factor.challenge_failed',
            AUTH_2FA_BACKUP_CODES_REGENERATED: 'auth.two_factor.backup_codes_regenerated',
            AUTH_OAUTH_LINKED: 'auth.oauth.linked',
            AUTH_OAUTH_FAILED: 'auth.oauth.failed'
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
});
