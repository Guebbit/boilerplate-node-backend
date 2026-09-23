/**
 * @module
 * The feedback route table. `routes.ts` mounts ONE public route (the visitor contact form),
 * then `router.use(getAuth, isAuthOrCredential)` and a `requirePermission('feedback.*')` per
 * route — everything below the mount is keyed, purely by position, and nothing looks wrong
 * either way if that is gotten wrong. Assertions here are positional for that reason (see
 * `effectiveRouteTable` in `tests/support/routes.ts`); per-route middleware alone would pass
 * whatever happened.
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
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/feedback/routes';

describe('feedback routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'POST /contact',
            'POST /search',
            'GET /',
            'PUT /:id',
            'DELETE /:id'
        ]);
    });
});

describe('feedback routes — the positional guard', () => {
    it('leaves POST /contact public, above the gate', () => {
        const guards = guardsOn(router, 'POST /contact');

        // The whole reason the module exists for a visitor. A guard reaching this route is an
        // outage of the contact form, not a hardening.
        expect(identityGuardIndex(guards)).toBe(-1);
        expect(guards).not.toContain('requirePermissionGuard');
    });

    it.each(['POST /search', 'GET /', 'PUT /:id', 'DELETE /:id'])(
        '%s sits below the gate and is keyed',
        (signature) => {
            const guards = guardsOn(router, signature);

            expect(guards).toContain('getAuth');
            expect(identityGuardIndex(guards)).toBeGreaterThanOrEqual(0);
            expect(guards).toContain('requirePermissionGuard');
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
            expect(guardsOn(router, signature)).toContain('requirePermissionGuard');
    });
});

describe('feedback routes — caching', () => {
    it('caches the admin listing and its DTO twin on one key, at the shorter TTL', () => {
        const listing = chainOf(router, 'GET /').find((entry) => entry.startsWith('setCache'));
        const search = chainOf(router, 'POST /search').find((entry) => entry.startsWith('setCache'));

        expect(listing).toBe(search);
        // 600, not the 3600 the catalogue uses: an operator queue is read while it changes.
        expect(listing).toContain('setCache(600');
        expect(optionsOf(chainOf(router, 'GET /'), 'setCache')).toMatchObject({
            tags: ['feedback'],
            keyAs: 'feedback:search'
        });
        expect(optionsOf(chainOf(router, 'GET /'), 'setCache').keyParameters).not.toHaveLength(0);
    });

    it.each(['POST /contact', 'PUT /:id', 'DELETE /:id'])(
        '%s invalidates the feedback tag',
        (signature) => {
            // Every write invalidates: a visitor submitting adds a row to the operator's queue, an
            // operator changing a status changes what that queue shows, and deleting a row removes
            // one from it.
            expect(chainOf(router, signature)).toContain('invalidateCache([feedback])');
        }
    );
});

describe('feedback routes — submission rate limiting', () => {
    it('rate-limits the contact form before it can invalidate the cache or write anything', () => {
        // The whole point is that a spent budget costs no cache invalidation and no database
        // write — see `contactLimiters`' own docs for why this is a DIFFERENT set of limiters
        // from `credentialLimiters`. All THREE dimensions — address, identity, address-block.
        const chain = chainOf(router, 'POST /contact');
        const limiters = chain.filter((entry) => entry.startsWith('submission'));

        expect(limiters).toEqual(['submissions', 'submission-identity', 'submission-block']);
        expect(chain.indexOf('submissions')).toBeLessThan(
            chain.indexOf('invalidateCache([feedback])')
        );
    });

    it('leaves every other route unbudgeted by the contact-form limiters', () => {
        // Only the public write needs this budget — the admin routes sit behind their own gate.
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                signature !== 'POST /contact' &&
                chainOf(router, signature).some((entry) => entry.startsWith('submission'))
        );

        expect(unexpected).toEqual([]);
    });
});

describe('feedback routes — human-challenge gate (rung 3)', () => {
    it('carries humanChallengeGate on POST /contact, after contactLimiters', () => {
        const chain = chainOf(router, 'POST /contact');

        expect(chain).toContain('humanChallengeGate');
        expect(chain.indexOf('humanChallengeGate')).toBeGreaterThan(
            chain.indexOf('submission-block')
        );
    });

    it('mounts the gate on no other route', () => {
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                signature !== 'POST /contact' && chainOf(router, signature).includes('humanChallengeGate')
        );

        expect(unexpected).toEqual([]);
    });
});
