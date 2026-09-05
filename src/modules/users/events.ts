/**
 * @module
 * Domain events this module emits, declared by augmenting the kernel's payload map rather than
 * editing it, so the catalogue grows with the modules that own events and no shared file
 * enumerates domains.
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A user account is about to be hard-deleted — a soft delete doesn't emit, since it's
         * reversible and cleanup would make the restore lossy. Emitted and awaited *before* the
         * write, so listeners still see a consistent database.
         */
        'user.deleted': { userId: string };

        /**
         * An admin created a user with no password and asked one queued up instead — see
         * `userService.create`. `account` owns tokens and outbound email, so it is the subscriber.
         */
        'user.setup-requested': { userId: string };
    }
}

/**
 * The event name, exported through the barrel so an emitter and its listeners share one spelling
 * rather than two string literals that typo independently.
 */
export const USER_DELETED = 'user.deleted';

/** See `DomainEventMap['user.setup-requested']` above. */
export const USER_SETUP_REQUESTED = 'user.setup-requested';
