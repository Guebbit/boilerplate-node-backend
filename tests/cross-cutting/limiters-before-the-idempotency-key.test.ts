/**
 * One app-wide rule: no rate limiter is mounted after `idempotencyKey` / `requireIdempotencyKey`
 * on any route.
 *
 * Why: the ledger stores whatever a keyed route answers and replays it for the retention window.
 * Every budget refuses BEFORE the key is claimed, so the ledger never sees a 429. A limiter behind
 * the key would break that, and a retry would be handed the stale refusal long after the wait.
 *
 * The mounted route table is read, so a new keyed route anywhere is covered the moment its module
 * is enabled. The limiters are recognised by tagging what `buildRateLimiter` returns, so a budget
 * added later is covered without a list to edit.
 */
import { effectiveRouteTable, guardsOn } from '@tests/routes';
import { ROUTED_MODULES } from '@tests/routed-modules';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () => {
    const actual = jest
        .requireActual<typeof import('@tests/routes')>('@tests/routes')
        .securityMock();

    // Same label key `routeTable` reads back (`Symbol.for` is the shared registry); the prefix
    // marks the middleware as a budget, whatever its namespace is.
    const tagged = (label: string) =>
        Object.assign(() => undefined, { [Symbol.for('tests.routeLabel')]: `limiter:${label}` });

    return {
        ...actual,
        buildRateLimiter: (budget: { namespace: string }) => tagged(budget.namespace),
        rateLimiter: tagged('global'),
        apiKeyLimiter: tagged('api-key'),
        uploadLimiter: tagged('uploads')
    };
});

/** The two middlewares that claim a key in the ledger. */
const KEY_CLAIMS = new Set(['idempotencyKey', 'requireIdempotencyKey']);

/** Every keyed route as `[`${module} ${METHOD} ${path}`, its guards in mount order]`. */
const keyedRoutes = (): [string, string[]][] =>
    Object.entries(ROUTED_MODULES).flatMap(([moduleName, router]) =>
        effectiveRouteTable(router)
            .map(
                ({ method, path }) =>
                    [`${moduleName} ${method} ${path}`, guardsOn(router, `${method} ${path}`)] as [
                        string,
                        string[]
                    ]
            )
            .filter(([, guards]) => guards.some((guard) => KEY_CLAIMS.has(guard)))
    );

describe('every budget refuses before the idempotency key is claimed', () => {
    // A vacuous pass would read as green: if the walker stopped seeing keyed routes, or the
    // tagging stopped marking limiters, the sweep below would check nothing.
    it('finds keyed routes to check', () => {
        expect(keyedRoutes().length).toBeGreaterThan(0);
    });

    it('recognises at least one budget on a keyed route', () => {
        expect(
            keyedRoutes().some(([, guards]) => guards.some((guard) => guard.startsWith('limiter:')))
        ).toBe(true);
    });

    it.each(keyedRoutes())('%s mounts no limiter behind the key', (_key, guards) => {
        const claim = guards.findIndex((guard) => KEY_CLAIMS.has(guard));
        const behind = guards.slice(claim + 1).filter((guard) => guard.startsWith('limiter:'));

        expect(behind).toEqual([]);
    });
});
