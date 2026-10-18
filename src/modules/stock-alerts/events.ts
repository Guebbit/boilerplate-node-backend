/**
 * @module
 * Domain events the stock alerts emit, declared by augmenting the kernel's payload map rather
 * than editing it, so the catalogue of events grows with the modules that own them.
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A buyer who asked to be told was told: the mail is queued and the request is gone.
         * Goes through the outbox in the transaction that deleted the request, so the inbox
         * row exists exactly when the request does not. `titles` is the product's name by
         * locale, so the row can name it even after the product is gone.
         */
        'stock_alert.sent': {
            userId: string;
            productId: string;
            titles: Record<string, string>;
        };
    }
}

/** The event name, exported so an emitter and its listeners share one spelling. */
export const STOCK_ALERT_SENT = 'stock_alert.sent';
