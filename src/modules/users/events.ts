/**
 * @module
 * Domain events this module emits.
 *
 * Declared by augmenting the kernel's payload map rather than by editing it, so the catalogue of
 * events grows with the modules that own them and no shared file enumerates domains.
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A user account is about to be destroyed. **Hard delete only** — a soft delete doesn't
         * emit, since it's reversible and cleaning up on it would make the restore lossy.
         *
         * Emitted and awaited *before* the write, so listeners that drop the account's rows still
         * see a consistent database.
         */
        'user.deleted': { userId: string };

        /**
         * An admin created a user with no password and asked one queued up instead — see
         * `userService.create`. This is the request to send them a way in. `account` owns tokens
         * and outbound email, so it is the (only) subscriber.
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
