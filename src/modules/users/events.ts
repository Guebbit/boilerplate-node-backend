/**
 * Domain events this module emits.
 *
 * Declared by augmenting the kernel's payload map rather than by editing it, so the catalogue of
 * events grows with the modules that own them and no shared file enumerates domains.
 */

declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A user account is about to be destroyed. **Hard delete only.**
         *
         * A soft delete deliberately does not emit: it is reversible, it keeps the cart the same way
         * it keeps everything else about the account, and a listener that cleaned up on a soft
         * delete would silently make the restore lossy.
         *
         * Emitted and awaited *before* the write, so listeners that drop the account's rows still
         * see a consistent database. The cart module deletes that user's cart; this module does not
         * know who else listens.
         */
        'user.deleted': { userId: string };

        /**
         * An admin created a user with no password and asked to have one queued up instead — see
         * `userService.create`. The user this names already exists with an unusable, randomly
         * generated password; this event is the request to send them a way in.
         *
         * `account` owns tokens and outbound email, so it is the (only) subscriber, the same way it
         * is the one that cleans up address books on `user.deleted`.
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
