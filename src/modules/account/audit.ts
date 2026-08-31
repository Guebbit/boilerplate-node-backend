/**
 * @module
 * Audit actions this module emits, declared by augmenting infrastructure's action map (type-only,
 * so infrastructure gains the union without importing anything upward) rather than editing it, so
 * the vocabulary grows with the modules that own it. The `auth.` prefix instead of `account.`:
 * these strings are queried by log tooling and alert rules that predate the module layout, so the
 * folder is free to be named for the domain while the wire format stays put.
 */

/** The audit action strings this module fires, keyed by event. */
export const accountAuditActions = {
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
} as const;

/** Augments infrastructure's audit action map with this module's own action strings. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        account: (typeof accountAuditActions)[keyof typeof accountAuditActions];
    }
}
