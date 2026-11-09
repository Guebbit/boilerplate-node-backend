/**
 * @module
 * The role door's route table. `assign:Role` is `credential: false`, so the door must be reached
 * by a session only: `isAuth`, never `isAuthOrCredential`, and a permission guard after it.
 */
import { routeSignatures, guardsOn } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);

import { router } from '@modules/users/role-routes';

/** Every endpoint of the role door, in mount order. */
const ALL = ['POST /:id/assign-role', 'POST /:id/revoke-role'];

describe('role door routes', () => {
    it('mounts exactly the two doors', () => {
        expect(routeSignatures(router)).toEqual(ALL);
    });

    it.each(ALL)('%s asks a session, never a credential, then the permission', (signature) => {
        const guards = guardsOn(router, signature);

        expect(guards).not.toContain('isAuthOrCredential');
        expect(guards.indexOf('getAuth')).toBeGreaterThanOrEqual(0);
        expect(guards.indexOf('getAuth')).toBeLessThan(guards.indexOf('isAuth'));
        expect(guards.indexOf('isAuth')).toBeLessThan(guards.indexOf('requirePermissionGuard'));
    });
});
