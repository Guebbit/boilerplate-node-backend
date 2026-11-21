/**
 * @module
 * The cart route table. Every route is authenticated at the router level and needs no rule
 * (every signed-in account shops); `/checkout` alone also
 * needs `checkout:Cart`, since an unproven address must not be able to spend, see
 * `shared/authorization-keys.generated.yaml`. A line is written under `/items`, so no root parameter route
 * competes with a literal segment.
 */

import { routeSignatures, guardsOn, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);

jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/cart/routes';

/**
 * Every route the cart module mounts, written out so a new route must be added here on purpose.
 */
const ALL = [
    'GET /summary',
    'POST /checkout',
    'POST /merge',
    'POST /reorder',
    'GET /',
    'POST /items',
    'DELETE /items',
    'PUT /shipping-method',
    'PATCH /items/:productId',
    'DELETE /items/:productId'
];

describe('cart routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual(ALL);
    });
});

describe('cart routes — authorization', () => {
    it.each(ALL)('%s requires a logged-in caller', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });
});

describe('cart routes — who spends', () => {
    it('asks a rule of the checkout alone, and only after a session is proven', () => {
        const ruled = ALL.filter((signature) =>
            guardsOn(router, signature).includes('requirePermissionGuard')
        );
        const guards = guardsOn(router, 'POST /checkout');

        expect(ruled).toEqual(['POST /checkout']);
        expect(guards.indexOf('isAuth')).toBeLessThan(guards.indexOf('requirePermissionGuard'));
    });
});

describe('cart routes — the checkout budget', () => {
    it('budgets the checkout, and only the checkout', () => {
        expect(chainOf(router, 'POST /checkout')).toContain('checkout');
        for (const signature of ALL.filter((entry) => entry !== 'POST /checkout'))
            expect(chainOf(router, signature)).not.toContain('checkout');
    });

    /**
     * Before the permission, a refused caller would spend it; after the idempotency ledger, a
     * replayed request would escape it, and a loop of retries is the thing being bounded.
     */
    it('spends after the permission check and before the idempotency ledger', () => {
        const chain = chainOf(router, 'POST /checkout');

        expect(chain.indexOf('checkout')).toBeGreaterThan(chain.indexOf('requirePermissionGuard'));
        expect(chain.indexOf('checkout')).toBeLessThan(chain.indexOf('idempotencyKey'));
    });
});

describe('cart routes — a merge is a hundred writes in one request', () => {
    it('is idempotent, so a retry after a lost response cannot add the guest cart twice', () => {
        expect(chainOf(router, 'POST /merge')).toContain('idempotencyKey');
    });

    it('spends its own budget before it is replayed, so a replay is not free', () => {
        const chain = chainOf(router, 'POST /merge');

        expect(chain.indexOf('cart-merge')).toBeGreaterThanOrEqual(0);
        expect(chain.indexOf('cart-merge')).toBeLessThan(chain.indexOf('idempotencyKey'));
    });
});

describe('cart routes — caching', () => {
    it('caches nothing, because a cart is per-caller state', () => {
        /**
         * A shared cache keyed without the caller would serve one shopper's cart to another. The
         * absence is the invariant, so it is asserted rather than assumed.
         */
        const cached = ALL.filter((signature) =>
            chainOf(router, signature).some((entry) => entry.startsWith('setCache'))
        );

        expect(cached).toEqual([]);
    });
});
