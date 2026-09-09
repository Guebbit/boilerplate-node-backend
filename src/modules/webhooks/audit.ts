/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. A subscription's `url` and secret ring are exactly the kind of thing a data-protection
 * question gets asked about later, so every write against it is audited, not only the destructive
 * one.
 */

/** The audit action vocabulary this module owns. */
export const webhooksAuditActions = {
    ADMIN_WEBHOOK_SUBSCRIPTION_CREATED: 'admin.webhook_subscription.created',
    ADMIN_WEBHOOK_SUBSCRIPTION_UPDATED: 'admin.webhook_subscription.updated',
    ADMIN_WEBHOOK_SUBSCRIPTION_DELETED: 'admin.webhook_subscription.deleted',
    ADMIN_WEBHOOK_DELIVERY_REPLAYED: 'admin.webhook_delivery.replayed'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        webhooks: (typeof webhooksAuditActions)[keyof typeof webhooksAuditActions];
    }
}
