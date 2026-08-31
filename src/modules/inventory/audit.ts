/**
 * @module
 * Audit actions this module emits, declared by augmentation rather than a shared enum — see
 * `modules/account/audit.ts` for why. Only three: the lifecycle transitions (reserve, commit,
 * release, expire) are consequences of a checkout, payment or cancellation, each of which already
 * audits itself and leaves a ledger row naming the order.
 *
 * See: docs/modules/inventory.md
 */

/** The audit action vocabulary this module owns. */
export const inventoryAuditActions = {
    ADMIN_STOCK_RECEIVED: 'admin.stock.received',
    ADMIN_STOCK_ADJUSTED: 'admin.stock.adjusted',
    ADMIN_RESERVATIONS_SWEPT: 'admin.reservations.swept'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        inventory: (typeof inventoryAuditActions)[keyof typeof inventoryAuditActions];
    }
}
