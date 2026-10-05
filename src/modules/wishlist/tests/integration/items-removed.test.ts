/**
 * @module
 * `productRemoveFromWishlistsById` announces whose wishlists held a removed product, with its
 * names, and announces nothing when none did — so `notifications` never writes a message about
 * nothing.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { WISHLIST_ITEMS_REMOVED } from '../../events';
import { productRemoveFromWishlistsById, wishlistService } from '../../service';

setupTestDb();

describe('productRemoveFromWishlistsById', () => {
    const announced = jest.fn();

    beforeEach(() => {
        resetDomainEvents();
        announced.mockReset();
        onDomainEvent(WISHLIST_ITEMS_REMOVED, announced);
    });

    it('announces whose wishlists held the product, with its names', async () => {
        const saver = await createUser();
        const product = await createProduct();
        await wishlistService.wishlistAdd(saver.id, String(product._id), testCallerContext);

        await productRemoveFromWishlistsById(String(product._id), { en: 'Blue mug' });

        expect(announced).toHaveBeenCalledTimes(1);
        expect(announced).toHaveBeenCalledWith(
            { userIds: [saver.id], productId: String(product._id), titles: { en: 'Blue mug' } },
            expect.anything()
        );
    });

    it('announces nothing when no wishlist held it', async () => {
        const product = await createProduct();

        await productRemoveFromWishlistsById(String(product._id), { en: 'Blue mug' });

        expect(announced).not.toHaveBeenCalled();
    });
});
