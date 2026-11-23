/**
 * @module
 * What `orders` adds to the sweeps' world: an order for the seeded product, owned by the account
 * the sweep runs as, for `{orderId}` and every `/orders/...` path.
 *
 * @see docs/build/module-removal.md#what-demo-remove-does-about-the-residue
 */
import type { SpecWorldContribution } from '@tests/spec-world';
import { readProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from './factories';

/** One unit of the world's product, so the order and the product it embeds are the same row. */
export const specWorld: SpecWorldContribution = {
    key: 'orderId',
    needs: ['productId'],
    seed: (owner, world) =>
        readProduct(world.productId)
            .then((product) => {
                // The product was seeded one step earlier, so the read finds it.
                if (!product) throw new Error('spec-world: the seeded product is gone');
                return createOrder(owner, [toOrderItem(product, 1)]);
            })
            .then((order) => String(order._id)),
    parameters: ['orderId'],
    pathPrefixes: [/^\/orders\//]
};
