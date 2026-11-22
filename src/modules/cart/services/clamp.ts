/**
 * @module
 * Stock clamping for a cart write: the domain rule plus what the service adds to it, the wire
 * `CartWarning` and the info line that makes a clamp loud on the server too.
 *
 * @see docs/modules/cart.md#stock-checked-in-three-places
 */

import { logger } from '@infrastructure/adapters/logger';
import type { CartWarning } from '@types';
import { clampToStock, type StockWarningCode } from '../domain';

/** What a write holds after the clamp, and the warning when that is less than it asked for. */
export interface ClampedLine {
    quantity: number;
    warning?: CartWarning;
}

/**
 * The warning for a clamped line, logged at info so a clamp is loud on the server too.
 *
 * @param productId - the product the line is for
 * @param code - what the domain rule decided
 * @param requested - what the write would hold without the stock limit
 * @param resulting - what the line holds after the write
 * @param quantityAvailable - how many could be bought, for the log only
 */
export const stockWarning = (
    productId: string,
    code: StockWarningCode,
    requested: number,
    resulting: number,
    quantityAvailable: number | undefined
): CartWarning => {
    logger.info({
        message: 'Cart write clamped to the stock that can be bought',
        productId,
        code,
        requested,
        resulting,
        quantityAvailable
    });
    return { code, productId, requested, resulting };
};

/**
 * Clamp one line to what can be bought.
 *
 * @param productId - the product the line is for
 * @param wanted - what the write would hold without the stock limit
 * @param held - what the line holds now, `0` for none
 * @param quantityAvailable - how many can be bought now; `undefined` is no limit
 * @returns what the line holds after the write, with the warning when it is less than `wanted`
 */
export const clampLine = (
    productId: string,
    wanted: number,
    held: number,
    quantityAvailable: number | undefined
): ClampedLine => {
    const { quantity, code } = clampToStock(wanted, held, quantityAvailable);
    return code === undefined
        ? { quantity }
        : { quantity, warning: stockWarning(productId, code, wanted, quantity, quantityAvailable) };
};
