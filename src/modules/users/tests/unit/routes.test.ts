/**
 * @module
 * The user-administration route table. Every route needs a caller by one line —
 * `router.use(getAuth, isAuthOrCredential)` — and then the `users.any.*` key its own mount
 * names, since `manager` and `support` do not hold the same one. A route added later inherits
 * the identity guard but not a key, and without one the entire directory is readable by any
 * logged-in customer. Both are asserted per endpoint rather than once, so a route mounted above
 * that `use` still fails here.
 */
import {
    routeTable,
    routeSignatures,
    guardsOn,
    optionsOf,
    identityGuardIndex,
    chainOf
} from '@tests/routes';

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
    'PUT /',
    'DELETE /',
    'GET /:id',
    'PUT /:id',
    'DELETE /:id',
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
    it('caches the two listings under one shared key', () => {
        const listing = chainOf(router, 'GET /').find((entry) => entry.startsWith('setCache'));
        const search = chainOf(router, 'POST /search').find((entry) =>
            entry.startsWith('setCache')
        );

        expect(listing).toBe(search);
        expect(listing).toContain('setCache(3600');
        expect(optionsOf(chainOf(router, 'GET /'), 'setCache')).toMatchObject({
            tags: ['users'],
            keyAs: 'users:search'
        });
        expect(optionsOf(chainOf(router, 'GET /'), 'setCache').keyParameters).not.toHaveLength(0);
    });

    it('caches the single read under the users tag', () => {
        expect(optionsOf(chainOf(router, 'GET /:id'), 'setCache')).toMatchObject({
            tags: ['users']
        });
    });

    it.each([
        'POST /',
        'PUT /',
        'DELETE /',
        'PUT /:id',
        'DELETE /:id',
        'DELETE /:id/hard',
        'DELETE /:id/2fa'
    ])('%s clears both the users and account tags', (signature) => {
        // Both, because the same row is served by two modules: `/users/:id` to an admin and
        // `/account` to its owner. Clearing one leaves the other serving the old profile.
        expect(chainOf(router, signature)).toContain('invalidateCache([users|account])');
    });

    it.each(['POST /', 'PUT /', 'PUT /:id'])(
        '%s accepts the imageUpload field and validates it',
        (signature) => {
            const chain = chainOf(router, signature);

            expect(chain).toContain('upload.single(imageUpload)');
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
