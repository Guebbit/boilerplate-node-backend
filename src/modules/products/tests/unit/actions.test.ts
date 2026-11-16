/**
 * @module
 * `productActions`: one flag per door, from the caller's keys and whether the product is
 * soft-deleted. Pure, so the whole table runs without a database.
 */
import { NO_PRODUCT_STANDING, productActions } from '../../domain/actions';

/** A product that is not deleted. */
const LIVE = {};
/** A product soft-deleted at a fixed instant. */
const DELETED = { deletedAt: '2026-11-01T10:00:00.000Z' };

describe('productActions', () => {
    it.each([
        ['no keys, live', NO_PRODUCT_STANDING, LIVE, [false, false, false, false]],
        ['no keys, deleted', NO_PRODUCT_STANDING, DELETED, [false, false, false, false]],
        [
            'update keys only, live',
            { update: true, delete: false },
            LIVE,
            [true, false, false, false]
        ],
        [
            'delete key only, live',
            { update: false, delete: true },
            LIVE,
            [false, true, false, true]
        ],
        [
            'delete key only, deleted',
            { update: false, delete: true },
            DELETED,
            [false, false, true, true]
        ],
        ['every key, live', { update: true, delete: true }, LIVE, [true, true, false, true]],
        ['every key, deleted', { update: true, delete: true }, DELETED, [true, false, true, true]]
    ])('%s', (_name, standing, product, flags) => {
        const actions = productActions(product, standing);

        expect([actions.update, actions.delete, actions.restore, actions.hardDelete]).toEqual(
            flags
        );
    });
});
