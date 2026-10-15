/**
 * The route table behind the account-protection matrix: every write route on `users` is either a
 * row of `tests/support/account-protection-rows.ts` or an entry of `UNOWNED_WRITES` with its reason.
 * A new write route fails here until someone decides which — the rule is only as good as the list
 * of routes it is asked on.
 */
import { effectiveRouteTable } from '@tests/routes';
import { ROUTED_MODULES } from '@tests/routed-modules';
import { PROTECTION_ROWS, UNOWNED_WRITES } from '@tests/account-protection-rows';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

/** The HTTP methods that change state. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Every write route of `users`, spelled `users ${METHOD} ${path}`. */
const mountedWrites = (): string[] =>
    effectiveRouteTable(ROUTED_MODULES.users)
        .filter(({ method }) => WRITE_METHODS.has(method))
        .map(({ method, path }) => `users ${method} ${path}`);

describe('the protection of staff accounts covers every write on an account', () => {
    it('lists every write route of users, as a row or as unowned', () => {
        const listed = new Set([
            ...PROTECTION_ROWS.map((row) => row.route),
            ...Object.keys(UNOWNED_WRITES)
        ]);

        expect(mountedWrites().filter((route) => !listed.has(route))).toEqual([]);
    });

    it('has no stale entry — every row and every exemption is a mounted write', () => {
        const mounted = new Set(mountedWrites());
        const listed = [...PROTECTION_ROWS.map((row) => row.route), ...Object.keys(UNOWNED_WRITES)];

        expect(listed.filter((route) => !mounted.has(route))).toEqual([]);
    });

    it('never lists a route as both a row and unowned', () => {
        const rows = new Set(PROTECTION_ROWS.map((row) => row.route));

        expect(Object.keys(UNOWNED_WRITES).filter((route) => rows.has(route))).toEqual([]);
    });

    // The canary: exact counts, so an emptied table cannot pass.
    it('counts exactly 6 rows and 2 exemptions', () => {
        expect(PROTECTION_ROWS).toHaveLength(6);
        expect(Object.keys(UNOWNED_WRITES)).toHaveLength(2);
        expect(mountedWrites()).toHaveLength(8);
    });
});
