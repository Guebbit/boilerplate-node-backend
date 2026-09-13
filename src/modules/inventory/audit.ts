/**
 * @module
 * Audit actions this module emits, declared by augmentation rather than a shared enum — see
 * `modules/account/audit.ts` for why. Four: the lifecycle transitions (reserve, commit, release,
 * expire) are consequences of a checkout, payment or cancellation, each of which already audits
 * itself and leaves a ledger row naming the order — except the one case where `commitForOrder`
 * finds no hold to claim. That is not a lifecycle event with an owner elsewhere; it is this
 * module's own invariant failing, so it is the one transition outcome audited here rather than by
 * its caller.
 *
 * See: docs/modules/inventory.md
 */

/** The audit action vocabulary this module owns. */
export const inventoryAuditActions = {
    ADMIN_STOCK_RECEIVED: 'admin.stock.received',
    ADMIN_STOCK_ADJUSTED: 'admin.stock.adjusted',
    ADMIN_RESERVATIONS_SWEPT: 'admin.reservations.swept',
    ADMIN_COMMIT_ORPHANED: 'admin.commit.orphaned'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        inventory: (typeof inventoryAuditActions)[keyof typeof inventoryAuditActions];
    }
}
