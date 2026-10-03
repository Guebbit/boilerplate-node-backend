/**
 * @module
 * The example route table. Everything below `router.use(getAuth, isAuth)` is signed-in purely by
 * position, and nothing looks wrong either way if a route is typed in the wrong half, so these
 * assertions are positional (see `tests/support/routes.ts`).
 */

import { chainOf, routeSignatures, guardsOn, identityGuardIndex } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);

import { router } from '@modules/example/routes';

describe('example routes: what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /published/:id',
            'POST /search',
            'GET /',
            'POST /',
            'GET /:id',
            'PUT /:id',
            'PATCH /:id',
            'DELETE /:id',
            'PUT /:id/cover'
        ]);
    });
});

describe('example routes: the positional guard', () => {
    it('leaves the published read public, above the gate', () => {
        const guards = guardsOn(router, 'GET /published/:id');

        expect(identityGuardIndex(guards)).toBe(-1);
        expect(guards).not.toContain('requirePermissionGuard');
    });

    it.each([
        'POST /search',
        'GET /',
        'POST /',
        'GET /:id',
        'PUT /:id',
        'PATCH /:id',
        'DELETE /:id',
        'PUT /:id/cover'
    ])('%s sits below the gate and is keyed', (signature) => {
        const guards = guardsOn(router, signature);

        expect(guards).toContain('getAuth');
        expect(identityGuardIndex(guards)).toBeGreaterThanOrEqual(0);
        expect(guards).toContain('requirePermissionGuard');
    });

    it('keeps the public route first, so the gate cannot be moved above it', () => {
        expect(routeSignatures(router)[0]).toBe('GET /published/:id');
    });

    it('declares /search before /:id, so the word is never read as an id', () => {
        const signatures = routeSignatures(router);

        expect(signatures.indexOf('POST /search')).toBeLessThan(signatures.indexOf('GET /:id'));
    });
});

describe('example routes: what runs before the write', () => {
    it('spends the creation budget before the controller, so a refused request costs no write', () => {
        const chain = chainOf(router, 'POST /');

        // The controller is the last handler in the chain, whatever it is called.
        expect(chain).toContain('example-create');
        expect(chain.indexOf('example-create')).toBeLessThan(chain.length - 1);
    });

    it('checks the upload budget, then reads the upload, before the cover controller', () => {
        const chain = chainOf(router, 'PUT /:id/cover');

        expect(chain.indexOf('uploads')).toBeGreaterThanOrEqual(0);
        expect(chain.indexOf('uploads')).toBeLessThan(chain.indexOf('upload.image'));
        expect(chain.indexOf('upload.image')).toBeLessThan(chain.length - 1);
    });
});
