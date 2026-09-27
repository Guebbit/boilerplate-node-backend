/**
 * @module
 * The invoicing route table — mounted at `/orders`, shared with `orders`' own router (see
 * `../../module.ts` and `orders/tests/unit/routes.test.ts`).
 */
import { routeSignatures, guardsOn, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/invoicing/routes';

describe('invoicing routes — what is mounted', () => {
    it('mounts exactly the two download routes', () => {
        expect(routeSignatures(router)).toEqual(['GET /:id/invoice', 'GET /:id/credit-note']);
    });
});

describe('invoicing routes — authorization', () => {
    it.each(['GET /:id/invoice', 'GET /:id/credit-note'])(
        '%s requires a logged-in caller',
        (signature) => {
            expect(guardsOn(router, signature)).toContain('isAuth');
        }
    );

    it.each(['GET /:id/invoice', 'GET /:id/credit-note'])(
        '%s is readable by any logged-in caller, scoped in the controller',
        (signature) => {
            expect(guardsOn(router, signature)).not.toContain('requirePermissionGuard');
        }
    );
});

describe('invoicing routes — rate limiting', () => {
    it('budgets both renders under the same namespace', () => {
        expect(chainOf(router, 'GET /:id/invoice')).toContain('invoicing-render');
        expect(chainOf(router, 'GET /:id/credit-note')).toContain('invoicing-render');
    });
});
