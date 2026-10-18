/**
 * @module
 * A `product.deleted` delivery that arrives late must not empty the baskets and wishlists of a
 * product that was restored meanwhile: the relay retries a failed handler, and a restore writes no
 * event of its own, so the retry is the only thing that can still say "deleted".
 */

import { setupTestDb } from '@tests/setup-test-db';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import wishlistModule from '@modules/wishlist/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { PRODUCT_DELETED, productService } from '@modules/products';
import { wishlistService } from '@modules/wishlist';
import { cartService } from '../../services';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([wishlistModule]);
});

afterEach(() => resetDomainEvents());

/** How many lines the shopper's basket holds. */
const basketLines = (userId: string) => cartService.get(userId).then((lines) => lines.length);

describe('a late product.deleted for a restored product', () => {
    it('leaves the basket line and the wishlist entry of a product on sale again', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        const id = String(product._id);

        await productService.remove(product, false);
        await settleOutboxNudges();
        await productService.restoreById(id);
        await cartService.setItemById(user.id, id, 1);
        await wishlistService.add(user.id, id, testCallerContext);

        // The retry of the first delivery, arriving after the restore.
        await emitDomainEvent(PRODUCT_DELETED, { productId: id, hardDelete: false, titles: {} });

        expect(await basketLines(user.id)).toBe(1);
        const wishlist = await wishlistService.get(user.id);
        expect(wishlist.items).toHaveLength(1);
    });

    it('still pulls the lines of a product that is deleted', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 5 });
        const id = String(product._id);
        await cartService.setItemById(user.id, id, 1);

        await productService.remove(product, false);
        await settleOutboxNudges();

        expect(await basketLines(user.id)).toBe(0);
    });
});
