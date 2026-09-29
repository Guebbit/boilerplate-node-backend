/**
 * @module
 * The returns route table — mounted at `/returns`. Every route is behind the auth wall; the staff
 * doors add the key that names the action, and only the write that opens a row carries the budget.
 */
import { routeSignatures, guardsOn, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/returns/routes';

describe('returns routes — what is mounted', () => {
    it('mounts the list, the open, one read, the two decisions and the receipt', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /',
            'POST /',
            'GET /:id',
            'POST /:id/approve',
            'POST /:id/decline',
            'POST /:id/receive'
        ]);
    });
});

describe('returns routes — authorization', () => {
    it.each([
        'GET /',
        'POST /',
        'GET /:id',
        'POST /:id/approve',
        'POST /:id/decline',
        'POST /:id/receive'
    ])('%s requires a logged-in caller', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it.each(['GET /', 'POST /', 'GET /:id'])(
        '%s is open to any signed-in caller — the service scopes it to their own orders',
        (signature) => {
            expect(guardsOn(router, signature)).not.toContain('requirePermissionGuard');
        }
    );

    it.each(['POST /:id/approve', 'POST /:id/decline', 'POST /:id/receive'])(
        '%s is staff’s alone',
        (signature) => {
            expect(guardsOn(router, signature)).toContain('requirePermissionGuard');
        }
    );
});

describe('returns routes — rate limiting and idempotency', () => {
    it('budgets the write that opens a return, and only that one', () => {
        expect(chainOf(router, 'POST /')).toContain('returns-write');
        expect(chainOf(router, 'GET /')).not.toContain('returns-write');
    });
});
