/**
 * @module
 * Domain events the webhooks module emits, declared by augmenting the kernel's payload map rather
 * than editing it. These are internal facts for sibling modules, never deliveries to a subscriber.
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * Repeated delivery failures switched a subscription off (`./services/attempt.ts`), emitted
         * once, by the call that actually disabled it. `notifications` turns it into a work notice
         * for the staff who manage webhooks.
         *
         * Internal only — no AsyncAPI channel carries it, and no webhook.
         */
        'webhook.subscription_auto_disabled': {
            tenantId: string;
            subscriptionId: string;
            /** ISO instant it was disabled: a later re-enable and disable is a new situation. */
            disabledAt: string;
        };
    }
}

/** See `DomainEventMap['webhook.subscription_auto_disabled']` above. */
export const WEBHOOK_SUBSCRIPTION_AUTO_DISABLED = 'webhook.subscription_auto_disabled';
