/**
 * @module
 * The operator's own stock writes: receive a delivery, adjust after a stocktake.
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { productService } from '@modules/products';
import { nudgeOutbox } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { StockMovementReason, type InventoryLevel, type CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { ERROR_CODES } from '@api/error-codes';
import { stockLevelRepository } from '../repository';
import { inventoryAuditActions } from '../audit';
import { applyTransition, refreshStockCache } from './transition';
import { allocateWithin } from './allocate';

/**
 * One product's counters, read back after a write.
 *
 * @param productId - the product
 * @param title - the product's title, already loaded by the caller's existence check
 * @returns its level, or `null` if the product has no level row (never received, or gone)
 */
const levelFor = (productId: string, title: string): Promise<InventoryLevel | null> =>
    stockLevelRepository.findByProductId(productId).then((level) =>
        level
            ? {
                  productId: String(level.productId),
                  title,
                  onHand: level.onHand,
                  reserved: level.reserved,
                  available: level.available,
                  backorderLimit: level.backorderLimit,
                  backordered: level.backordered
              }
            : null
    );

/**
 * A delivery and the preorders it serves, as ONE transaction: the units arrive and are allocated
 * to the paid preorders waiting for them oldest payment first, so they never look sellable in
 * between. Everything that cannot roll back — waking the outbox relay, the catalogue's stock
 * cache — waits for the commit.
 *
 * @param productId - the product the delivery is for
 * @param quantity - how many units arrived
 * @param note - the operator's words for the ledger row
 * @returns whether the delivery landed
 */
const receiveAndAllocate = (
    productId: string,
    quantity: number,
    note: string | undefined
): Promise<boolean> =>
    withTransaction((session) =>
        applyTransition(
            StockMovementReason.receive,
            productId,
            quantity,
            note === undefined ? {} : { note },
            session
        ).then((moved) => (moved ? allocateWithin([productId], session).then(() => true) : false))
    ).then((moved) => {
        if (!moved) return false;
        nudgeOutbox();
        return refreshStockCache(productId).then(() => true);
    });

/**
 * What varies between `receive` and `adjust` — both check the product exists, apply a signed
 * transition, decide the failure status, audit the write, then answer with the fresh level.
 */
interface AdminStockTransition {
    reason: StockMovementReason;
    productId: string;
    /** Signed for `adjust`, always positive for `receive` — `applyTransition`'s own `quantity`. */
    amount: number;
    note?: string;
    context?: CallerContext;
    /**
     * Called only when `applyTransition` refuses. `receive`'s guard covers just "the product is
     * still there", so its refusal is always a 404 — left `undefined`, the default below.
     * `adjust`'s guard covers a second rule (not below what's reserved) too, so it re-reads to
     * tell which one refused and answers 409 for the rule.
     */
    onFailure?: (productId: string) => Promise<ResponseReject>;
    /** Whether the write also serves the paid preorders waiting for stock — only a receipt does. */
    allocates?: boolean;
    auditAction: (typeof inventoryAuditActions)[keyof typeof inventoryAuditActions];
    buildAuditMetadata: (level: InventoryLevel) => Record<string, unknown>;
    successMessageKey: string;
}

/**
 * The shared body of every admin stock transition — see {@link AdminStockTransition} for what
 * `receive` and `adjust` each supply to make it theirs.
 */
const applyAdminStockTransition = ({
    reason,
    productId,
    amount,
    note,
    context,
    onFailure,
    allocates = false,
    auditAction,
    buildAuditMetadata,
    successMessageKey
}: AdminStockTransition): Promise<ResponseSuccess<InventoryLevel> | ResponseReject> =>
    // Checked BEFORE the write: `conditionFor`'s `receive` case is `{}` (any row matches, or a
    // fresh one is created), so an unknown product would otherwise still get a level row AND a
    // ledger entry before this ever found out there was nothing to receive against.
    productService.findByIdRaw(productId).then((product) => {
        if (!product) return generateReject(404, [t('inventory.product-not-found')]);

        const applied = allocates
            ? receiveAndAllocate(productId, amount, note)
            : applyTransition(reason, productId, amount, note === undefined ? {} : { note });

        return applied.then((moved) => {
            if (!moved) {
                return onFailure
                    ? onFailure(productId)
                    : generateReject(404, [t('inventory.product-not-found')]);
            }

            return levelFor(productId, product.title).then((level) => {
                if (!level) return generateReject(404, [t('inventory.product-not-found')]);

                recordAudit(context, {
                    action: auditAction,
                    outcome: 'success',
                    targetType: 'product',
                    targetId: productId,
                    metadata: buildAuditMetadata(level)
                });

                return generateSuccess(level, 200, t(successMessageKey));
            });
        });
    });

/**
 * Units arrive from a supplier. The only guard is that the product exists, so a refusal means
 * it does not.
 *
 * @param productId - the product
 * @param quantity - how many arrived; strictly positive, the contract enforces it too
 * @param note - what to record: supplier, delivery note, operator's words
 * @param context - audit context for `ADMIN_STOCK_RECEIVED`; tests omit it to skip the emit
 * @returns the counters after the delivery, or 404 if the product is unknown
 */
export const receive = (
    productId: string,
    quantity: number,
    note?: string,
    context?: CallerContext
): Promise<ResponseSuccess<InventoryLevel> | ResponseReject> =>
    applyAdminStockTransition({
        reason: StockMovementReason.receive,
        productId,
        amount: quantity,
        note,
        context,
        allocates: true,
        auditAction: inventoryAuditActions.ADMIN_STOCK_RECEIVED,
        buildAuditMetadata: (level) => ({ quantity, onHand: level.onHand }),
        successMessageKey: 'inventory.receive-success'
    });

/**
 * A stocktake correction — signed, since shrinkage is the common case and negative. Refused if it
 * would leave fewer units than are already reserved: those are promised to orders that exist, and
 * the fix is to cancel orders rather than let availability go negative and oversell.
 *
 * @param productId - the product
 * @param delta - signed and non-zero; the controller rejects zero
 * @param note - why; an unexplained correction is what an audit looks for
 * @param context - audit context for `ADMIN_STOCK_ADJUSTED`; tests omit it to skip the emit
 * @returns the counters after the correction, 404 if unknown, or 409 if below reserved
 */
export const adjust = (
    productId: string,
    delta: number,
    note?: string,
    context?: CallerContext
): Promise<ResponseSuccess<InventoryLevel> | ResponseReject> =>
    applyAdminStockTransition({
        reason: StockMovementReason.adjust,
        productId,
        amount: delta,
        note,
        context,
        /*
         * The write's guard covers two things at once — the product existing and the correction
         * fitting above what is reserved — so `false` alone can't say which refused. Re-reading
         * separates them, so a product deleted between the check and this write reports 404
         * rather than a misleading stock conflict.
         */
        onFailure: (id) =>
            productService.findByIdRaw(id).then((stillThere) => {
                if (!stillThere) return generateReject(404, [t('inventory.product-not-found')]);

                return generateReject(409, [
                    {
                        code: ERROR_CODES.INVENTORY_BELOW_RESERVED,
                        message: t('inventory.below-reserved')
                    }
                ]);
            }),
        auditAction: inventoryAuditActions.ADMIN_STOCK_ADJUSTED,
        buildAuditMetadata: (level) => ({ delta, note, onHand: level.onHand }),
        successMessageKey: 'inventory.adjust-success'
    });

/**
 * Set how many units of a product may be backordered at once. Not a stock movement — nothing on the
 * shelf changes — so it writes no ledger row; it is audited. Lowering it below what is outstanding
 * is allowed: those orders stand and only new ones are refused.
 *
 * @param productId - the product
 * @param backorderLimit - the new allowance; `0` closes it, `null` removes the cap
 * @param context - audit context for `ADMIN_BACKORDER_LIMIT_SET`; tests omit it to skip the emit
 * @returns the counters after the change, or 404 if the product is unknown
 */
export const setBackorderLimit = (
    productId: string,
    backorderLimit: number | null,
    context?: CallerContext
): Promise<ResponseSuccess<InventoryLevel> | ResponseReject> =>
    productService.findByIdRaw(productId).then((product) => {
        if (!product) return generateReject(404, [t('inventory.product-not-found')]);

        return (
            stockLevelRepository
                .setBackorderLimit(productId, backorderLimit)
                // The catalogue's copy carries the allowance, which is what a preorder's `available`
                // counts down from: bring it into step with the new limit.
                .then(() => refreshStockCache(productId))
                .then(() => levelFor(productId, product.title))
                .then((level) => {
                    if (!level) return generateReject(404, [t('inventory.product-not-found')]);

                    recordAudit(context, {
                        action: inventoryAuditActions.ADMIN_BACKORDER_LIMIT_SET,
                        outcome: 'success',
                        targetType: 'product',
                        targetId: productId,
                        metadata: { backorderLimit }
                    });

                    return generateSuccess(level, 200, t('inventory.backorder-limit-success'));
                })
        );
    });
