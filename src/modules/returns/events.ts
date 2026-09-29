/**
 * @module
 * Domain events this module emits, added by augmenting the kernel's payload map — see
 * `modules/orders/events.ts` for why augmentation rather than a central list. Each one is
 * projected into `webhooks`' public catalogue by `module.ts`'s `publicEvents`.
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A return was opened for dispatched goods — a withdrawal (born approved) or a request
         * awaiting staff. Never fired for a withdrawal before dispatch: that has no return row, it
         * is `order.cancelled`.
         */
        'return.requested': { returnId: string; orderId: string; reason: string };
    }
}

/** See `DomainEventMap['return.requested']` above. */
export const RETURN_REQUESTED = 'return.requested';
