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
    /*
     * A refresh token was presented AFTER it was already rotated away, and outside the grace
     * window a benign two-tabs race would fall inside — the signal that the token value itself
     * has leaked. `rotateRefreshToken` fires this and revokes the whole refresh set in the same
     * breath.
     */
    AUTH_REFRESH_TOKEN_REUSE_DETECTED: 'auth.refresh_token.reuse_detected',
    /** A caller re-proved their password to earn a fresh session. */
    AUTH_REAUTHENTICATED: 'auth.reauth',
    AUTH_LOGGED_OUT: 'auth.logout',
    AUTH_LOGGED_OUT_EVERYWHERE: 'auth.logout_all',
    AUTH_SESSION_REVOKED: 'auth.session.revoked',
    AUTH_TOKEN_EXPIRED_CLEANUP: 'auth.token.expired_cleanup',
    /** The caller pulled a full copy of their own data. */
    AUTH_DATA_EXPORTED: 'auth.data_export.completed',
    /** A pending TOTP secret was confirmed and armed — 2FA is now on for this account. */
    AUTH_2FA_ENROLLED: 'auth.two_factor.enrolled',
    AUTH_2FA_DISABLED: 'auth.two_factor.disabled',
    /**
     * A password checked out, but the code or backup code presented for the second factor did
     * not — a sharper signal than a login failure, same reasoning `AUTH_REAUTHENTICATED`'s
     * comment on `authReauthTotal` gives: someone holds a valid credential and still failed.
     */
    AUTH_2FA_CHALLENGE_FAILED: 'auth.two_factor.challenge_failed'
} as const;

/** Augments infrastructure's audit action map with this module's own action strings. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        account: (typeof accountAuditActions)[keyof typeof accountAuditActions];
    }
}
