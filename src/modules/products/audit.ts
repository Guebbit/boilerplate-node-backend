/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * Only the writes. Reading the catalogue is public and unauthenticated, so there is no actor to
 * record and nothing a compliance query would ask about it.
 */

/** The audit action vocabulary this module owns. */
export const productsAuditActions = {
    ADMIN_PRODUCT_CREATED: 'admin.product.created',
    ADMIN_PRODUCT_UPDATED: 'admin.product.updated',
    ADMIN_PRODUCT_DELETED: 'admin.product.deleted'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        products: (typeof productsAuditActions)[keyof typeof productsAuditActions];
    }
}
