/**
 * The stats route table. The subject is the guard: every route needs a session and
 * `stats.any.read`, none is public, and none writes — a read that grows a write is a decision
 * somebody must make.
 */

import { routeSignatures, routeTable, guardsOn } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/stats/routes';

describe('stats routes', () => {
    it('mounts exactly the documented reads, all GET', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /sales',
            'GET /products',
            'GET /products/:productId',
            'GET /categories',
            'GET /payments',
            'GET /operations',
            'GET /customers',
            'GET /pipeline'
        ]);
    });

    it.each(routeSignatures(router))('%s requires a session', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it('guards every route on the one key', () => {
        expect(routeTable(router).map(({ permissionKey }) => permissionKey)).toEqual(
            Array.from({ length: 8 }, () => 'stats.any.read')
        );
    });
});
