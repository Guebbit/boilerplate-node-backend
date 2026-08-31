/**
 * @module
 * The cart route table.
 *
 * A cart is per-caller state, so every route is authenticated at the router level and none is
 * admin — there is no operator view of someone else's cart. What this file mostly guards is
 * ORDER: `/summary`, `/checkout` and `/reorder/:orderId` are all single- or two-segment paths
 * competing with `/:productId`, and Express takes the first match. Declared the other way round,
 * `GET /cart/summary` becomes a lookup for a product with the id "summary", and `POST
 * /cart/checkout` silently stops being checkout.
 */

import { routeTable, routeSignatures, guardsOn } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);

import { router } from '@modules/cart/routes';

/** The middleware chain mounted on one endpoint, by signature. */
const chainOf = (signature: string) =>
    routeTable(router).find(({ method, path }) => `${method} ${path}` === signature)!.chain;

const ALL = [
    'GET /summary',
    'POST /checkout',
    'POST /reorder/:orderId',
    'GET /',
    'POST /',
    'DELETE /',
    'PUT /:productId',
    'DELETE /:productId'
];

describe('cart routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual(ALL);
    });

    it('declares the literal segments before /:productId', () => {
        const paths = routeTable(router).map(({ path }) => path);

        expect(paths.indexOf('/summary')).toBeLessThan(paths.indexOf('/:productId'));
        expect(paths.indexOf('/checkout')).toBeLessThan(paths.indexOf('/:productId'));
    });
});

describe('cart routes — authorization', () => {
    it.each(ALL)('%s requires a logged-in caller', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it('is admin-free by design', () => {
        // A cart belongs to its owner and to nobody else; there is no operator route here to
        // guard. If one is added, this fails and the addition gets looked at.
        const adminGuarded = ALL.filter((signature) =>
            guardsOn(router, signature).includes('isAdmin')
        );

        expect(adminGuarded).toEqual([]);
    });
});

describe('cart routes — caching', () => {
    it('clears orders and products at checkout, where both actually change', () => {
        // Checkout is the one cart route with effects outside the cart: it creates an order and
        // commits reserved stock. Nothing else here changes a cacheable resource.
        expect(chainOf('POST /checkout')).toContain('invalidateCache([orders|products])');
    });

    it('caches nothing, because a cart is per-caller state', () => {
        // A shared cache keyed without the caller would serve one shopper's cart to another. The
        // absence is the invariant, so it is asserted rather than assumed.
        const cached = ALL.filter((signature) =>
            chainOf(signature).some((entry) => entry.startsWith('setCache'))
        );

        expect(cached).toEqual([]);
    });
});
