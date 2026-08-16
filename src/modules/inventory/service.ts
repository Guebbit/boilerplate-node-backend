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
import { Types } from 'mongoose';
import type { StockMovement } from '@types';
import type { StockMovementDocument } from './model';

/**
 * The `STOCK_MOVED` listener — one announcement, one row.
 *
 * Takes the contract's `StockMovement` less the three fields the ledger itself supplies, rather
 * than a hand-written copy of the other four. The id is converted rather than cast: the payload
 * carries a string, the column holds an `ObjectId`, and doing that conversion here is the whole
 * difference between a bridge and a claim that the two were the same all along.
 */
export const recordMovement = (
    movement: Omit<StockMovement, 'id' | 'createdAt' | 'updatedAt'>
): Promise<unknown> =>
    stockMovementRepository.create({
        ...movement,
        productId: new Types.ObjectId(movement.productId)
    });

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

/** The module's one service handle. */
export const inventoryService = {
    recordMovement,
    listMovements,
    restock
};
