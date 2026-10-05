/**
 * @module
 * Level rows and the reads over them: the stock board, the low-stock gauge, the ledger.
 */

import { productService } from '@modules/products';
import type { InventoryLevel, StockMovement } from '@types';
import {
    normalizePagination,
    buildPaginatedMeta,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import { lowStockThreshold } from '../config';
import { stockLevelRepository, stockMovementRepository } from '../repository';
import type { LevelFilters, MovementFilters } from './types';

/**
 * Guarantee a product has a level row, even at zero — `module.ts`'s `PRODUCT_CREATED` listener's
 * own job, called REGARDLESS of the opening quantity. `receive` is never called for an opening
 * count of zero, so relying on it alone as this module's reaction to a new product would leave a
 * zero-quantity product with no row at all: invisible to the stock board and the low-stock gauge,
 * both of which start from this collection.
 *
 * @param productId - the product just created
 */
export const ensureLevel = (productId: string): Promise<void> =>
    stockLevelRepository.ensure(productId).then(() => undefined);

/**
 * Erase a product's level row — `module.ts`'s `PRODUCT_DELETED` listener's own job, and ONLY for
 * the `hardDelete: true` half of that event: a soft delete (or its restore) must leave the
 * counters untouched, since a restore has to come back to them. See
 * `repository.ts`'s `deleteByProductId` for why `stockmovements` is untouched either way.
 *
 * @param productId - the product just hard-deleted
 */
export const removeLevel = (productId: string): Promise<void> =>
    stockLevelRepository.deleteByProductId(productId);

/**
 * How many units of each product can be sold right now, read from the ledger.
 *
 * The checkout pre-flight asks this rather than the catalogue's cached copy: a cache that sits
 * low (a missed sync) would refuse a sale the shelf covers, and nothing would ever heal it, since
 * a refused checkout moves no stock. A level that never existed reads as nothing available.
 *
 * @param productIds - the products to look up
 * @returns available units by product id; absent for a product with no level row
 */
export const availableFor = (productIds: readonly string[]): Promise<Map<string, number>> =>
    stockLevelRepository
        .findManyByProductIds(productIds)
        .then(
            (levels) => new Map(levels.map((level) => [String(level.productId), level.available]))
        );

/**
 * A page of the stock board — every product's counters, scarcest first, sorted by what's left
 * rather than name. Paged and sorted inside mongod on `stocklevels` alone; the title each row
 * needs is asked of `productService` AFTER the page is settled, API composition rather than a
 * database join across module boundaries — see `repository.ts`'s `stockBoard`.
 * A row whose product `findManyByIds` cannot find falls back to the id itself rather than
 * dropping the row: a hard-deleted product's level row cannot outlive it, so this should be
 * unreachable in practice, and a row a buggy future change left behind is still worth an admin
 * seeing, not silently hiding a counter that still holds units.
 *
 * @param filters - `lowOnly` to keep only scarce rows, plus the shared `page`/`pageSize`
 * @returns the page and its pagination meta
 */
export const listLevels = async (
    filters: LevelFilters = {}
): Promise<{ items: InventoryLevel[]; meta: PaginatedMeta }> => {
    const pagination = normalizePagination(filters);
    const { items, totalItems } = await stockLevelRepository.stockBoard({
        skip: pagination.skip,
        limit: pagination.pageSize,
        ...(filters.lowOnly ? { maxAvailable: lowStockThreshold() } : {})
    });

    const products = await productService.findManyByIds(items.map((item) => item.productId));
    const titleOf = new Map(products.map((product) => [String(product._id), product.title]));

    return {
        items: items.map((item) => ({
            ...item,
            title: titleOf.get(item.productId) ?? item.productId
        })),
        meta: buildPaginatedMeta(pagination, totalItems)
    };
};

/**
 * How many PUBLICLY VISIBLE products are at or under the low-stock threshold — the gauge
 * `metrics.ts` scrapes. Composed the same way `listLevels` is: the candidate ids come from this
 * module's own counters, `productService.countPublic` answers which of them a buyer could
 * actually find.
 */
export const lowStockCount = (): Promise<number> =>
    stockLevelRepository
        .lowAvailabilityProductIds(lowStockThreshold())
        .then((ids) => productService.countPublic(ids));

/**
 * A page of the ledger, newest first. Reports `totalItems` since this is the record an auditor
 * works through — a read that silently truncated it would misreport history as complete.
 *
 * @param filters - `productId`, `reason`, and the shared `page`/`pageSize`
 * @returns the page and its pagination meta
 */
export const listMovements = (
    filters: MovementFilters = {}
): Promise<{ items: StockMovement[]; meta: PaginatedMeta }> =>
    // No sort argument: `search`'s default is `DEFAULT_SORT`, which is this exact order and
    // the only one that makes a paged ledger stable.
    stockMovementRepository.search(filters);
