/**
 * Inventory — the ledger's rules, all three of them.
 *
 * Recording is the `STOCK_MOVED` listener: whoever moved units announces it, this module writes
 * the row. Restocking is the one movement this module ORIGINATES — the conditional increment on
 * the product first, then the announcement, so the ledger hears it through the same ear as every
 * other movement and cannot double-write. Reading is newest-first, optionally per product.
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { emitDomainEvent } from '@kernel/events';
import { productRepository, STOCK_MOVED } from '@modules/products';
import { stockMovementRepository } from './repository';
import type { StockMovementDocument, MovementReason } from './model';

/** The `STOCK_MOVED` listener — one announcement, one row. */
export const recordMovement = (movement: {
    productId: string;
    delta: number;
    reason: MovementReason;
    reference?: string;
}): Promise<unknown> =>
    // The cast bridges the payload's string id to the schema's ObjectId; Mongoose casts it.
    stockMovementRepository.create(movement as unknown as Partial<StockMovementDocument>);

/**
 * The latest movements, for the admin's ledger view.
 *
 * @param productId - narrow to one product's story; omitted, the whole shop's
 */
export const listMovements = (
    productId?: string
): Promise<ResponseSuccess<{ items: StockMovementDocument[] }>> =>
    stockMovementRepository.findLatest(productId).then((items) => generateSuccess({ items }));

/**
 * Put units on a shelf — the admin's "the truck arrived" button.
 *
 * Goes through `incrementStock` (the same helper every other movement uses) and then ANNOUNCES,
 * so the row this module ends up writing took the same path as a sale's. The updated count is
 * read back and returned for the form to show.
 *
 * @param productId - the product
 * @param quantity - how many units arrived; strictly positive, the contract enforces it too
 */
export const restock = async (
    productId: string,
    quantity: number
): Promise<ResponseSuccess<{ productId: string; stock: number }> | ResponseReject> => {
    const product = await productRepository.findByIdRaw(productId);
    if (!product) return generateReject(404, [t('inventory.product-not-found')]);

    await productRepository.incrementStock(productId, quantity);
    await emitDomainEvent(STOCK_MOVED, {
        productId,
        delta: quantity,
        reason: 'restock'
    });

    const updated = await productRepository.findByIdRaw(productId);
    return generateSuccess(
        { productId, stock: updated?.stock ?? 0 },
        200,
        t('inventory.restock-success')
    );
};
