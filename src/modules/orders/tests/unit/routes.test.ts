/**
 * @module
 * The orders route table. The whole router is authenticated at the top (`router.use(getAuth,
 * isAuth)`), with the admin guard applied per route — an `requirePermission` omitted from a write reads as
 * "any authenticated user may do this", easy to get wrong in the unsafe direction. `POST
 * /:id/cancel` is deliberately NOT admin-guarded, since a customer cancelling their own order is
 * the one write they may make; its safety comes from the service's scoped conditional write, not
 * the router.
 */
import { routeTable, routeSignatures, guardsOn, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/orders/routes';

describe('order routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'POST /search',
            'GET /',
            'POST /',
            'PUT /',
            'DELETE /',
            'POST /:id/cancel',
            'POST /:id/status-override',
            'GET /:id/invoice',
            'GET /:id',
            'PUT /:id',
            'DELETE /:id',
            'POST /:id/restore',
            'DELETE /:id/hard'
        ]);
    });

    it('declares /search and the two-segment reads before /:id', () => {
        const paths = routeTable(router).map(({ path }) => path);

        // `/search` genuinely shadows: one segment, same verb family. `/:id/invoice` is two
        // segments so it cannot be shadowed by `/:id` — it is ordered for readability, and
        // asserting it keeps the file's stated convention from decaying silently.
        expect(paths.indexOf('/search')).toBeLessThan(paths.indexOf('/:id'));
        expect(paths.indexOf('/:id/invoice')).toBeLessThan(paths.indexOf('/:id'));
    });
});

describe('order routes — authorization', () => {
    it.each([
        'POST /search',
        'GET /',
        'POST /',
        'PUT /',
        'DELETE /',
        'POST /:id/cancel',
        'POST /:id/status-override',
        'GET /:id/invoice',
        'GET /:id',
        'PUT /:id',
        'DELETE /:id',
        'DELETE /:id/hard'
    ])('%s requires a logged-in caller', (signature) => {
        // Router-level, so this asserts the `router.use` really covers every route — including
        // any added later, which is the whole reason it is mounted there rather than per route.
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it.each(['POST /', 'PUT /', 'DELETE /', 'PUT /:id', 'DELETE /:id', 'DELETE /:id/hard'])(
        '%s is admin-only',
        (signature) => {
            expect(guardsOn(router, signature)).toContain('requirePermissionGuard');
        }
    );

    it('gates the override door behind its own permission, not the ordinary write one', () => {
        // A distinct key (`orders.any.override`), so `orders.any.update` alone never reaches this
        // door — see `shared/authorization-keys.yaml`'s `stepUp: critical` on it.
        expect(guardsOn(router, 'POST /:id/status-override')).toContain('requirePermissionGuard');
    });

    it('leaves POST /:id/cancel open to the owner, not just admins', () => {
        // Not an oversight: the customer cancel. Its authorization is the caller scope inside
        // `orderService.cancelById`, covered by `service-scope.test.ts` and `cancel.test.ts`.
        // Adding `requirePermission` here would silently remove the feature.
        expect(guardsOn(router, 'POST /:id/cancel')).not.toContain('requirePermissionGuard');
    });

    it.each(['POST /search', 'GET /', 'GET /:id', 'GET /:id/invoice'])(
        '%s is readable by any logged-in caller, scoped in the service',
        (signature) => {
            expect(guardsOn(router, signature)).not.toContain('requirePermissionGuard');
        }
    );
});

describe('order routes — caching', () => {
    // D2: an order's answer depends on who is asking (non-admins see only their own), so none
    // of the three may go through the shared Redis cache — RFC 9111 §3.5. `privateNoCache` lets
    // the BROWSER keep its own copy, revalidated every time.
    it.each(['GET /', 'POST /search', 'GET /:id'])(
        '%s is never Redis-cached, only privateNoCache',
        (signature) => {
            const chain = chainOf(router, signature);

            expect(chain).toContain('privateNoCache');
            expect(chain.some((entry) => entry.startsWith('setCache'))).toBe(false);
        }
    );

    // Not cached — every hit renders fresh, and there is no separate ready/pending status left to
    // invalidate a cache entry over.
    it('GET /:id/invoice carries no setCache', () => {
        expect(
            chainOf(router, 'GET /:id/invoice').some((entry) => entry.startsWith('setCache'))
        ).toBe(false);
    });

    it('invalidates products wherever stock moves, and nothing on this router is Redis-cached any more', () => {
        // Creating an order and cancelling one both change availability, so both must clear the
        // catalogue. `orders` is gone from both — the last route on this router that tagged a
        // cache entry `orders` was removed by D2, so there is nothing left to invalidate.
        expect(chainOf(router, 'POST /')).toContain('invalidateCache([products])');
        expect(chainOf(router, 'POST /:id/cancel')).toContain('invalidateCache([products])');

        for (const signature of routeSignatures(router))
            expect(
                chainOf(router, signature).some((entry) => entry.startsWith('invalidateCache'))
            ).toBe(
                signature === 'POST /' || signature === 'POST /:id/cancel' // the two above
            );
    });

    it('reaches the hard delete only through the flag route', () => {
        expect(chainOf(router, 'DELETE /:id/hard')).toContain('routeFlag(hardDelete)');
        expect(chainOf(router, 'DELETE /:id')).not.toContain('routeFlag(hardDelete)');
        expect(chainOf(router, 'DELETE /')).not.toContain('routeFlag(hardDelete)');
    });
});

describe('order routes — invoice rate limiting', () => {
    it('budgets the invoice render, and only it', () => {
        // Every hit spawns a Chromium launch — see `rate-limits.ts`'s own docs for why this
        // route alone needs a budget the rest of the router does not.
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                signature !== 'GET /:id/invoice' &&
                chainOf(router, signature).includes('orders-invoice')
        );

        expect(chainOf(router, 'GET /:id/invoice')).toContain('orders-invoice');
        expect(unexpected).toEqual([]);
    });
});
