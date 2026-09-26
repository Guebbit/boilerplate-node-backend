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
         * An admin created a user with no password and asked one queued up instead — see
         * `userService.create`. `account` owns tokens and outbound email, so it is the subscriber.
         */
        'user.setup-requested': { userId: string };
    }
}

/** See `DomainEventMap['user.setup-requested']` above. */
export const USER_SETUP_REQUESTED = 'user.setup-requested';
