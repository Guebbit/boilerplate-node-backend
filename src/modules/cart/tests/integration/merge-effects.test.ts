/**
 * @module
 * What a merge DOES besides answering — its analytics events, and the one refusal that only a race
 * can cause — and what removing a product from carts announces. These are the observable effects
 * the answer's own tests do not reach: a dashboard series that silently stops, or an announcement
 * that fires with nobody to tell.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { observePort } from '@tests/ports';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { cartAnalyticsEvents } from '../../analytics';
import { cartRepository, QUANTITY_LIMIT } from '../../repository';
import { CART_LINES_REMOVED } from '../../events';
import { cartItemAddById, cartMerge, productRemoveFromCartsById } from '../../services';

/*
 * The analytics port is REPLACED with a recording wrapper around the real one, not spied on:
 * `jest.spyOn` cannot redefine the non-configurable property a CommonJS namespace import exposes
 * under the swc transform the mutation runs use.
 */
jest.mock('@infrastructure/observability/analytics', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/analytics')>(
        '@infrastructure/observability/analytics'
    );
    return { __esModule: true, ...actual, emitAnalyticsEvent: jest.fn(actual.emitAnalyticsEvent) };
});

setupTestDb();

describe('a merge’s analytics', () => {
    it('counts a line that got created as an add, with the product and the quantity', async () => {
        const user = await createUser();
        const product = await createProduct();
        const emit = observePort(analyticsPort.emitAnalyticsEvent);

        await cartMerge(
            user.id,
            [{ productId: String(product._id), quantity: 2 }],
            testCallerContext
        );

        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({
                event: cartAnalyticsEvents.CART_ITEM_ADDED,
                properties: { product_id: String(product._id), quantity: 2 }
            })
        );
    });

    it('counts a line that grew an existing one as an update, not an add', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemAddById(user.id, String(product._id), 1);
        const emit = observePort(analyticsPort.emitAnalyticsEvent);

        await cartMerge(
            user.id,
            [{ productId: String(product._id), quantity: 3 }],
            testCallerContext
        );

        expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({
                event: cartAnalyticsEvents.CART_ITEM_UPDATED,
                properties: { product_id: String(product._id), quantity: 3 }
            })
        );
    });

    it('counts nothing for a line that never reached the cart', async () => {
        const user = await createUser();
        const emit = observePort(analyticsPort.emitAnalyticsEvent);

        // An id nobody holds and no product has: refused as unavailable, written nowhere.
        await cartMerge(
            user.id,
            [{ productId: '000000000000000000000000', quantity: 1 }],
            testCallerContext
        );

        expect(emit).not.toHaveBeenCalled();
    });
});

describe('a merge that loses a race at the cap', () => {
    it('answers the line as capped, with what the cart holds, and counts nothing', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartItemAddById(user.id, String(product._id), 5);
        // Between the rule's read and the write another request filled the line: the repository
        // refuses the add. Only a race can say so, hence a stand-in for it.
        jest.spyOn(cartRepository, 'upsertLine').mockResolvedValueOnce(QUANTITY_LIMIT);
        const emit = observePort(analyticsPort.emitAnalyticsEvent);

        const { lines } = await cartMerge(
            user.id,
            [{ productId: String(product._id), quantity: 2 }],
            testCallerContext
        );

        expect(lines).toEqual([
            {
                productId: String(product._id),
                requested: 2,
                resulting: 5,
                reason: 'capped',
                insufficientStock: false
            }
        ]);
        expect(emit).not.toHaveBeenCalled();
    });
});

describe('productRemoveFromCartsById', () => {
    const announced = jest.fn();

    beforeEach(() => {
        resetDomainEvents();
        announced.mockReset();
        onDomainEvent(CART_LINES_REMOVED, announced);
    });

    it('announces whose carts held the product, with its names', async () => {
        const holder = await createUser();
        const product = await createProduct();
        await cartItemAddById(holder.id, String(product._id), 1);

        await productRemoveFromCartsById(String(product._id), { en: 'Blue mug' });

        expect(announced).toHaveBeenCalledTimes(1);
        expect(announced).toHaveBeenCalledWith(
            { userIds: [holder.id], productId: String(product._id), titles: { en: 'Blue mug' } },
            expect.anything()
        );
    });

    it('announces nothing when no cart held it, so nobody is told about nothing', async () => {
        const product = await createProduct();

        await productRemoveFromCartsById(String(product._id), { en: 'Blue mug' });

        expect(announced).not.toHaveBeenCalled();
    });
});
