/**
 * The route table behind the rank-rule matrix: every write route on users, orders, delivery,
 * payments, returns and api-keys is either a row of `tests/support/role-hierarchy-rows.ts` or an entry of
 * `UNOWNED_WRITES` with its reason. A new write route on one of the six fails here until someone
 * decides which — the rule is only as good as the list of routes it is asked on.
 */
import { effectiveRouteTable } from '@tests/routes';
import { ROUTED_MODULES } from '@tests/routed-modules';
import { HIERARCHY_ROWS, UNOWNED_WRITES } from '@tests/role-hierarchy-rows';

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

/** The modules whose writes can touch something a person owns. */
const COVERED_MODULES = ['users', 'orders', 'delivery', 'payments', 'returns', 'api-keys'];

/** The HTTP methods that change state. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Every write route of the covered modules, spelled `${module} ${METHOD} ${path}`. */
const mountedWrites = (): string[] =>
    COVERED_MODULES.flatMap((name) =>
        effectiveRouteTable(ROUTED_MODULES[name])
            .filter(({ method }) => WRITE_METHODS.has(method))
            .map(({ method, path }) => `${name} ${method} ${path}`)
    );

describe('the rank rule covers every write on something a person owns', () => {
    it('lists every write route of the six modules, as a row or as unowned', () => {
        const listed = new Set([
            ...HIERARCHY_ROWS.map((row) => row.route),
            ...Object.keys(UNOWNED_WRITES)
        ]);

        expect(mountedWrites().filter((route) => !listed.has(route))).toEqual([]);
    });

    it('has no stale entry — every row and every exemption is a mounted write', () => {
        const mounted = new Set(mountedWrites());
        const listed = [...HIERARCHY_ROWS.map((row) => row.route), ...Object.keys(UNOWNED_WRITES)];

        expect(listed.filter((route) => !mounted.has(route))).toEqual([]);
    });

    it('never lists a route as both a row and unowned', () => {
        const rows = new Set(HIERARCHY_ROWS.map((row) => row.route));

        expect(Object.keys(UNOWNED_WRITES).filter((route) => rows.has(route))).toEqual([]);
    });

    // The canary: exact counts, so an emptied table cannot pass.
    it('counts exactly 23 rows and 11 exemptions', () => {
        expect(HIERARCHY_ROWS).toHaveLength(23);
        expect(Object.keys(UNOWNED_WRITES)).toHaveLength(11);
        expect(mountedWrites()).toHaveLength(34);
    });
});
