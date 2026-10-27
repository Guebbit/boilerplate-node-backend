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

        /**
         * The owner withdrew analytics consent (`true` → `false`), committed with the profile save.
         * `account` is its own subscriber: it asks the analytics provider to forget the id, since
         * what was captured under the consent is no longer lawful to keep (GDPR Art. 7(3), 17).
         * Internal only: no AsyncAPI channel carries it.
         */
        'account.analytics_consent_withdrawn': { userId: string };

        /**
         * A data export could not be built (GDPR Art. 12(3): the person is owed their file within
         * a month), committed with the move of its row to `failed`. `tickets` opens the work from
         * it. Internal only: no AsyncAPI channel carries it.
         */
        'account.export_failed': { userId: string; exportId: string };

        /**
         * A data export is ready, committed with the move of its row to `ready`. A later ready
         * export is what closes the work an earlier failure opened. Internal only.
         */
        'account.export_ready': { userId: string; exportId: string };
    }
}

/** See `DomainEventMap['account.sessions-revoked']` above. */
export const ACCOUNT_SESSIONS_REVOKED = 'account.sessions-revoked';

/** See `DomainEventMap['account.authenticator-removed']` above. */
export const ACCOUNT_AUTHENTICATOR_REMOVED = 'account.authenticator-removed';

/** See `DomainEventMap['account.analytics_consent_withdrawn']` above. */
export const ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN = 'account.analytics_consent_withdrawn';

/** See `DomainEventMap['account.export_failed']` above. */
export const ACCOUNT_EXPORT_FAILED = 'account.export_failed';

/** See `DomainEventMap['account.export_ready']` above. */
export const ACCOUNT_EXPORT_READY = 'account.export_ready';
