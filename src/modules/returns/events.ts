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
         * A return was opened — a withdrawal (born approved, or born closed when it reached the
         * order before dispatch) or a request awaiting staff.
         */
        'return.requested': { returnId: string; orderId: string; reason: string };

        /**
         * The goods arrived and went back on sale — one `restock` movement per line, in the same
         * transaction as the status move.
         */
        'return.received': { returnId: string; orderId: string };

        /**
         * The return is finished: the money went back (or there was none to return). Fires when
         * the refund settles — straight away, or later when the payment sweep completes it. A
         * withdrawal before dispatch fires it at birth, right after `return.requested`: the order's
         * own cancel carries the refund.
         */
        'return.closed': {
            returnId: string;
            orderId: string;
            refundAmount: number;
            currency: string;
        };
    }
}

/** See `DomainEventMap['return.requested']` above. */
export const RETURN_REQUESTED = 'return.requested';

/** See `DomainEventMap['return.received']` above. */
export const RETURN_RECEIVED = 'return.received';

/** See `DomainEventMap['return.closed']` above. */
export const RETURN_CLOSED = 'return.closed';
