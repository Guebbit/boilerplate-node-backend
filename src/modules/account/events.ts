/**
 * @module
 * Domain events this module emits, declared by augmenting the kernel's payload map rather than
 * editing it, so the catalogue grows with the modules that own events and no shared file
 * enumerates domains.
 */

/** Why an account's sessions were ended wholesale — the cases a subscriber must treat as a compromise. */
export type SessionsRevokedReason = 'logout-all' | 'password-reset';

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * The account's owner ended every session (logout everywhere) or recovered the account
         * through a password reset: both mean "I may be compromised". `api-keys` is the subscriber,
         * revoking what the person minted, since a key outlives every session. Internal only: no
         * AsyncAPI channel carries it, nothing outside this application needs to know.
         */
        'account.sessions-revoked': { userId: string; reason: SessionsRevokedReason };
    }
}

/** See `DomainEventMap['account.sessions-revoked']` above. */
export const ACCOUNT_SESSIONS_REVOKED = 'account.sessions-revoked';
