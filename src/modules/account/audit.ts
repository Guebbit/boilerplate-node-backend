/**
 * Audit actions this module emits.
 *
 * Declared by augmenting infrastructure's action map rather than by editing it, so the vocabulary grows with
 * the modules that own it and no shared file enumerates domains. The augmentation is type-only —
 * `infrastructure` gains the union without importing anything upward.
 *
 * The `auth.` prefix rather than `account.`: these strings are queried by log tooling and alert
 * rules that predate the module layout, and a prefix rename is a change to every saved search
 * someone has built. The folder is free to be named for the domain; the wire format is not.
 */

export const accountAuditActions = {
    AUTH_LOGIN_SUCCEEDED: 'auth.login.succeeded',
    AUTH_LOGIN_FAILED: 'auth.login.failed',
    AUTH_SIGNUP_SUCCEEDED: 'auth.signup.succeeded',
    AUTH_SIGNUP_FAILED: 'auth.signup.failed',
    AUTH_ACCOUNT_UPDATED: 'auth.account.updated',
    AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
    AUTH_PASSWORD_RESET_COMPLETED: 'auth.password_reset.completed',
    AUTH_PASSWORD_CHANGE_COMPLETED: 'auth.password_change.completed',
    AUTH_PASSWORD_CHANGE_FAILED: 'auth.password_change.failed',
    AUTH_ACCOUNT_DELETE_REQUESTED: 'auth.account_delete.requested',
    AUTH_ACCOUNT_DELETE_COMPLETED: 'auth.account_delete.completed',
    AUTH_EMAIL_VERIFY_REQUESTED: 'auth.email_verify.requested',
    AUTH_EMAIL_VERIFY_COMPLETED: 'auth.email_verify.completed',
    AUTH_REFRESH_SUCCEEDED: 'auth.refresh.succeeded',
    AUTH_REFRESH_FAILED: 'auth.refresh.failed',
    AUTH_LOGOUT_SUCCEEDED: 'auth.logout.succeeded',
    AUTH_LOGOUT_ALL_SUCCEEDED: 'auth.logout_all.succeeded',
    AUTH_SESSION_REVOKED: 'auth.session.revoked',
    AUTH_TOKEN_EXPIRED_CLEANUP: 'auth.token.expired_cleanup'
} as const;

declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        account: (typeof accountAuditActions)[keyof typeof accountAuditActions];
    }
}
