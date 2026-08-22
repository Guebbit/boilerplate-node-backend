/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * Three, and they are exactly the three things a HUMAN does to stock. The lifecycle transitions —
 * reserve, commit, release, expire — are not audited here: they are consequences of a checkout, a
 * payment or a cancellation, each of which audits itself at the request that caused it, and each
 * of which already leaves a ledger row naming the order. Auditing them again would record the
 * same fact twice under two vocabularies.
 *
 * The stocktake adjustment is the one that matters. Corrections are the classic place shrinkage
 * hides, and the row says which admin moved how many units and what reason they gave.
 */

export const inventoryAuditActions = {
    ADMIN_STOCK_RECEIVED: 'admin.stock.received',
    ADMIN_STOCK_ADJUSTED: 'admin.stock.adjusted',
    ADMIN_RESERVATIONS_SWEPT: 'admin.reservations.swept'
} as const;

declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        inventory: (typeof inventoryAuditActions)[keyof typeof inventoryAuditActions];
    }
}
