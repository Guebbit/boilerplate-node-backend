/**
 * @module
 * The user-administration route table. Every route needs a caller by one line —
 * `router.use(getAuth, isAuthOrCredential)` — and then the `users.any.*` key its own mount
 * names, since `manager` and `support` do not hold the same one. A route added later inherits
 * the identity guard but not a key, and without one the entire directory is readable by any
 * logged-in customer. Both are asserted per endpoint rather than once, so a route mounted above
 * that `use` still fails here.
 */
import { routeTable, routeSignatures, guardsOn, identityGuardIndex, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);

import { router } from '@modules/users/routes';

/** Every documented endpoint on this router, in mount order. */
const ALL = [
    'POST /search',
    'GET /',
    'POST /',
    'DELETE /',
    'GET /:id',
    'PUT /:id',
    'PATCH /:id',
    'DELETE /:id',
    'POST /:id/restore',
    'DELETE /:id/hard',
    'DELETE /:id/2fa'
];

describe('user routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual(ALL);
    });

    it('declares /search before /:id, so it is reachable at all', () => {
        const paths = routeTable(router).map(({ path }) => path);

        expect(paths.indexOf('/search')).toBeLessThan(paths.indexOf('/:id'));
    });
});

describe('user routes — authorization', () => {
    it.each(ALL)('%s is reachable only by an authenticated admin', (signature) => {
        const guards = guardsOn(router, signature);

        // All three, in order. `getAuth` populates the context, the identity guard demands one,
        // `requirePermission` reads the role off it — `requirePermission` first would read a role
        // from nothing. This module's identity guard is `isAuthOrCredential`: the directory is a
        // tenant surface an api key may sync against.
        const identity = identityGuardIndex(guards);

        expect(guards).toContain('getAuth');
        expect(identity).toBeGreaterThanOrEqual(0);
        expect(guards).toContain('requirePermissionGuard');
        expect(guards.indexOf('getAuth')).toBeLessThan(identity);
        expect(identity).toBeLessThan(guards.indexOf('requirePermissionGuard'));
    });

    it('has no public endpoint at all', () => {
        // The directory is admin-only in full. This is the assertion that fails if someone mounts
        // a "harmless" public read above the gate.
        const unguarded = routeSignatures(router).filter(
            (signature) => !guardsOn(router, signature).includes('requirePermissionGuard')
        );

        expect(unguarded).toEqual([]);
    });
});

describe('user routes — caching and uploads', () => {
    // D2: the answer depends on who is asking (an admin's directory search, someone's own
    // profile by id), so none of the three may go through the shared Redis cache — RFC 9111
    // §3.5. `privateNoCache` lets the BROWSER keep its own copy, revalidated every time.
    it.each(['GET /', 'POST /search', 'GET /:id'])(
        '%s is never Redis-cached, only privateNoCache',
        (signature) => {
            const chain = chainOf(router, signature);

            expect(chain).toContain('privateNoCache');
            expect(chain.some((entry) => entry.startsWith('setCache'))).toBe(false);
        }
    );

    it.each([
        'POST /',
        'DELETE /',
        'PUT /:id',
        'PATCH /:id',
        'DELETE /:id',
        'DELETE /:id/hard',
        'DELETE /:id/2fa'
    ])(
        '%s carries no cache invalidation — nothing on this router is Redis-cached any more',
        (signature) => {
            expect(
                chainOf(router, signature).some((entry) => entry.startsWith('invalidateCache'))
            ).toBe(false);
        }
    );

    it.each(['POST /', 'PUT /:id', 'PATCH /:id'])(
        '%s accepts the imageUpload field and validates it',
        (signature) => {
            const chain = chainOf(router, signature);

            expect(chain).toContain('upload.image');
            expect(chain).toContain('validateUploadedImages');
            expect(chain).toContain('quarantineUploadedImages');
        }
    );

    it('reaches the hard delete only through the flag route', () => {
        expect(chainOf(router, 'DELETE /:id/hard')).toContain('routeFlag(hardDelete)');
        expect(chainOf(router, 'DELETE /:id')).not.toContain('routeFlag(hardDelete)');
        expect(chainOf(router, 'DELETE /')).not.toContain('routeFlag(hardDelete)');
    });
});
