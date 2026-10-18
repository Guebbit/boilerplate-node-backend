/**
 * @module
 * Domain events this module emits, declared by augmenting the kernel's payload map rather than
 * editing it, so the catalogue grows with the modules that own events and no shared file
 * enumerates domains.
 */

import type { SessionsRevokedReason } from './domain/revocation';

export type { SessionsRevokedReason } from './domain/revocation';

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * The account's owner ended every session (logout everywhere), recovered the account
         * through a password reset, or reported an email change as not theirs: each means "I may be
         * compromised". `api-keys` is the subscriber,
         * revoking what the person minted, since a key outlives every session. Internal only: no
         * AsyncAPI channel carries it, nothing outside this application needs to know.
         */
        'account.sessions-revoked': { userId: string; reason: SessionsRevokedReason };

        /**
         * A staff member's last authenticator app was removed: their role grants nothing from now
         * on, and `api-keys` revokes what they minted under it. Not a compromise, so it is not a
         * session revocation. Internal only: no AsyncAPI channel carries it.
         */
        'account.authenticator-removed': { userId: string };
    }
}

/** See `DomainEventMap['account.sessions-revoked']` above. */
export const ACCOUNT_SESSIONS_REVOKED = 'account.sessions-revoked';

/** See `DomainEventMap['account.authenticator-removed']` above. */
export const ACCOUNT_AUTHENTICATOR_REMOVED = 'account.authenticator-removed';
