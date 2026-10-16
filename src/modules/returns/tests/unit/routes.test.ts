/**
 * @module
 * The returns route table — mounted at `/returns`. Every route is behind the auth wall; the staff
 * doors add the key that names the action, and only the write that opens a row carries the budget.
 */
import { routeSignatures, guardsOn, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

jest.mock('@kernel/middlewares/authorizations', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').authGuardsMock()
);

import { router } from '@modules/returns/routes';

describe('returns routes — what is mounted', () => {
    it('mounts the list, the open, the options, one read, the two decisions and the receipt', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /',
            'POST /',
            'GET /options',
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
        'GET /options',
        'GET /:id',
        'POST /:id/approve',
        'POST /:id/decline',
        'POST /:id/receive'
    ])('%s requires a logged-in caller', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it.each(['GET /', 'POST /', 'GET /options', 'GET /:id'])(
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

describe('returns routes — the options read', () => {
    it('is mounted before `/:id`, which would otherwise read "options" as an id', () => {
        const signatures = routeSignatures(router);

        expect(signatures.indexOf('GET /options')).toBeLessThan(signatures.indexOf('GET /:id'));
    });
});

describe('returns routes — rate limiting and idempotency', () => {
    it('budgets the write that opens a return, and only that one', () => {
        expect(chainOf(router, 'POST /')).toContain('returns-write');
        expect(chainOf(router, 'GET /')).not.toContain('returns-write');
    });

    it.each(['POST /', 'POST /:id/receive'])(
        '%s replays a retried request through the idempotency ledger',
        (signature) => {
            expect(chainOf(router, signature)).toContain('idempotencyKey');
        }
    );
});

describe('returns routes — guard order on POST /returns', () => {
    // The ledger records any JSON answer: a step-up challenge placed after it would be replayed as
    // the answer to the same key once the staff member has re-authenticated.
    it('spends the budget, then asks the step-up, then opens the idempotency ledger', () => {
        const chain = chainOf(router, 'POST /');
        const budget = chain.indexOf('returns-write');
        const stepUp = chain.indexOf('requireFreshAuthWhen(critical)');
        const ledger = chain.indexOf('idempotencyKey');

        expect(budget).toBeGreaterThanOrEqual(0);
        expect(stepUp).toBeGreaterThan(budget);
        expect(ledger).toBeGreaterThan(stepUp);
    });
});
