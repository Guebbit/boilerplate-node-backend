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
} as const;

declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        account: (typeof accountAuditActions)[keyof typeof accountAuditActions];
    }
}
