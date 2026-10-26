/**
 * @module
 * Domain events this module emits, declared by augmenting the kernel's payload map rather than
 * editing it, so the catalogue grows with the modules that own events and no shared file
 * enumerates domains.
 */

/**
 * The personal-data fields whose change is announced, named as the audit trail names them
 * (`services/audit-changes.ts`). Preferences (locale, consent) are not in it.
 */
export type UserChangedField = 'username' | 'email' | 'phone' | 'website' | 'imageUrl';

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * An admin created a user with no password and asked one queued up instead — see
         * `userService.create`. `account` owns tokens and outbound email, so it is the subscriber.
         */
        'user.setup-requested': { userId: string };
        /**
         * An admin banned an account (`active: true` → `false`), committed with the save that ended
         * its sessions. `account` owns the one-time links, so it is the subscriber that purges them.
         */
        'user.deactivated': { userId: string };
        /**
         * Staff restored an account its owner had scheduled for erasure, committed with the write
         * that cleared the schedule. `account` owns the restore link and the mail, so it is the
         * subscriber that drops the link and tells the owner.
         */
        'user.deletion-cancelled': { userId: string };
        /**
         * An account was hard-deleted, committed in the erasure transaction itself, so it exists
         * exactly when the erasure did. `users` is its own subscriber: it asks the analytics
         * provider to forget the account id (GDPR Art. 17).
         */
        'user.erased': { userId: string };
        /**
         * A personal-data field of an account was rectified, committed with the save that moved it.
         * Field names only, never values: the outbox row is kept and the delivery log replayable.
         * No in-process subscriber; it exists for the `user.updated` webhook (GDPR Art. 19).
         */
        'user.profile_changed': { userId: string; changed: UserChangedField[] };
    }
}

/** See `DomainEventMap['user.setup-requested']` above. */
export const USER_SETUP_REQUESTED = 'user.setup-requested';

/** See `DomainEventMap['user.deactivated']` above. */
export const USER_DEACTIVATED = 'user.deactivated';

/** See `DomainEventMap['user.deletion-cancelled']` above. */
export const USER_DELETION_CANCELLED = 'user.deletion-cancelled';

/** See `DomainEventMap['user.erased']` above. */
export const USER_ERASED = 'user.erased';

/** See `DomainEventMap['user.profile_changed']` above. */
export const USER_PROFILE_CHANGED = 'user.profile_changed';
