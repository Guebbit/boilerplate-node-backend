/**
 * @module
 * Optional capability, in its own file: the domain events this module emits, added by augmenting
 * the kernel's payload map — see `modules/orders/events.ts` for why augmentation rather than a
 * central list. Each one also becomes a public webhook through `module.ts`'s `publicEvents`.
 *
 * See: docs/tools/events-and-logging.md#the-domain-event-bus-and-what-it-is-not
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /** An example moved to `published`, for the first time or after being archived. */
        'example.published': { exampleId: string; userId: string; title: string };
    }
}

/** See `DomainEventMap['example.published']` above. */
export const EXAMPLE_PUBLISHED = 'example.published';
