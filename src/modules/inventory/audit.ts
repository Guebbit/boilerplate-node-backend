/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * One action: the restock is the only request-shaped thing inventory does. The ledger rows ride
 * events whose originating requests (checkout, cancel, the admin product write) audit themselves.
 */

export const inventoryAuditActions = {
    ADMIN_STOCK_RESTOCKED: 'admin.stock.restocked'
} as const;

declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        inventory: (typeof inventoryAuditActions)[keyof typeof inventoryAuditActions];
    }
}
