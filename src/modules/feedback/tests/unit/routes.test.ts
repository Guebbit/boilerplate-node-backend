/**
 * The feedback route table — and the positional guard it is built around.
 *
 * `routes.ts` mounts ONE public route, the visitor contact form, and then calls
 * `router.use(getAuth, isAuth, isAdmin)`. Everything below that line is the operator's view of
 * what visitors sent; everything above it is public. The file says so in a comment, because the
 * arrangement is load-bearing and invisible: a route appended in the wrong half is public, or
 * admin-only, purely by where it was typed, and nothing about it looks wrong either way.
 *
 * These assertions are positional for that reason — see `effectiveRouteTable` in
 * `tests/support/routes.ts`. Asserting the per-route middleware alone would report every route
 * here as unguarded and pass whatever happened.
 */
import { routeTable, routeSignatures, guardsOn } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);

import { router } from '@modules/feedback/routes';

/** The middleware chain mounted on one endpoint, by signature. */
const chainOf = (signature: string) =>
    routeTable(router).find(({ method, path }) => `${method} ${path}` === signature)!.chain;

describe('feedback routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'POST /contact',
            'POST /search',
            'GET /',
            'PUT /:id'
        ]);
    });
});

describe('feedback routes — the positional guard', () => {
    it('leaves POST /contact public, above the gate', () => {
        const guards = guardsOn(router, 'POST /contact');

        // The whole reason the module exists for a visitor. A guard reaching this route is an
        // outage of the contact form, not a hardening.
        expect(guards).not.toContain('isAuth');
        expect(guards).not.toContain('isAdmin');
    });

    it.each(['POST /search', 'GET /', 'PUT /:id'])(
        '%s sits below the gate and is admin-only',
        (signature) => {
            const guards = guardsOn(router, signature);

            expect(guards).toContain('getAuth');
            expect(guards).toContain('isAuth');
            expect(guards).toContain('isAdmin');
        }
    );

    it('keeps the contact route first, so the gate cannot be moved above it', () => {
        // If `router.use` were mounted at the top instead, this ordering assertion would still
        // pass — but the guard assertion above would fail, which is the pair that pins it.
        expect(routeSignatures(router)[0]).toBe('POST /contact');
    });

    it('guards every route that reads what visitors submitted', () => {
        // Stated as a sweep rather than a list: a route added below the gate is covered
        // automatically, and one added above it fails here.
        const readsSubmissions = routeSignatures(router).filter(
            (signature) => signature !== 'POST /contact'
        );

        for (const signature of readsSubmissions)
            expect(guardsOn(router, signature)).toContain('isAdmin');
    });
});

describe('feedback routes — caching', () => {
    it('caches the admin listing and its DTO twin on one key, at the shorter TTL', () => {
        const listing = chainOf('GET /').find((entry) => entry.startsWith('setCache'));
        const search = chainOf('POST /search').find((entry) => entry.startsWith('setCache'));

        expect(listing).toBe(search);
        // 600, not the 3600 the catalogue uses: an operator queue is read while it changes.
        expect(listing).toContain('setCache(600');
        expect(listing).toContain('tags=[feedback]');
        expect(listing).toContain('keyAs=feedback:search');
        expect(listing).not.toContain('keyParameters=[]');
    });

    it.each(['POST /contact', 'PUT /:id'])('%s invalidates the feedback tag', (signature) => {
        // Both ends write: a visitor submitting adds a row to the operator's queue, and an
        // operator changing a status changes what that queue shows.
        expect(chainOf(signature)).toContain('invalidateCache([feedback])');
    });
});
