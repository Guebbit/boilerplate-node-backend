import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Router } from 'express';
import { effectiveRouteTable } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/adapters/storage', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router as accountRouter } from '@modules/account/routes';
import { router as cartRouter } from '@modules/cart/routes';
import { router as deliveryRouter } from '@modules/delivery/routes';
import { router as feedbackRouter } from '@modules/feedback/routes';
import { router as inventoryRouter } from '@modules/inventory/routes';
import { router as localesRouter } from '@modules/locales/routes';
import { router as observabilityRouter } from '@modules/observability/routes';
import { router as ordersRouter } from '@modules/orders/routes';
import { router as paymentsRouter } from '@modules/payments/routes';
import { router as productsRouter } from '@modules/products/routes';
import { router as usersRouter } from '@modules/users/routes';
import { router as wishlistRouter } from '@modules/wishlist/routes';

/**
 * Guard: a controller that reads `authContextOf` is mounted behind `isAuth`.
 *
 * `Request.authContext` is optional, correctly — it is absent until the auth middleware resolves
 * it. `authContextOf` asserts it is there, once, with the argument written down; this is the half
 * no type can carry, because whether the ROUTE is authenticated lives in `routes.ts`.
 *
 * Without it the assertion is just a nicer-looking version of the `!` it replaced. With it, a
 * controller that starts reading the caller and is mounted on a public route fails here rather
 * than answering `undefined.id` at runtime.
 *
 * The second half of that question — which routes are unauthenticated — used to be answered by
 * reading `routes.ts` as text and regexing it line by line. That answered a weaker question than
 * this one does: a guard written through a variable, a spread, or a multi-line `router.use` read
 * as unguarded to the regex and does not to {@link effectiveRouteTable}, because by the time this
 * runs Express has already resolved every spelling of a guard to the same stack.
 */

/** Every module directory under `src/modules/`, router or not. */
const MODULES_ROOT = path.join(__dirname, '..', '..', 'src', 'modules');
const moduleNames = (): string[] => readdirSync(MODULES_ROOT);

/**
 * Modules that mount a router, imported directly — the same twelve
 * `tests/cross-cutting/write-routes-are-guarded.test.ts` imports, and for the same reason: this
 * file needs the real mounted stack, not a re-parse of the source that produced it.
 */
const ROUTED_MODULES: Record<string, Router> = {
    account: accountRouter,
    cart: cartRouter,
    delivery: deliveryRouter,
    feedback: feedbackRouter,
    inventory: inventoryRouter,
    locales: localesRouter,
    observability: observabilityRouter,
    orders: ordersRouter,
    payments: paymentsRouter,
    products: productsRouter,
    users: usersRouter,
    wishlist: wishlistRouter
};

/** Controllers that read the caller through the accessor, by exported handler name. */
const handlersReadingAuthContext = (moduleRoot: string): Set<string> => {
    const controllers = path.join(moduleRoot, 'controllers');
    if (!existsSync(controllers)) return new Set();

    const names = new Set<string>();
    for (const file of readdirSync(controllers).filter((f) => f.endsWith('.ts'))) {
        const source = readFileSync(path.join(controllers, file), 'utf8');
        if (!source.includes('authContextOf(')) continue;
        for (const [, name] of source.matchAll(/export const (\w+) = /g)) names.add(name);
    }
    return names;
};

/**
 * Every handler name mounted on a route that {@link effectiveRouteTable} does not report as
 * carrying `isAuth` — router-level or per-route, in the same order a real request sees them.
 */
const handlersMountedUnauthenticated = (router: Router): Set<string> => {
    const mounted = new Set<string>();
    for (const row of effectiveRouteTable(router)) {
        if ([...row.applies, ...row.chain].includes('isAuth')) continue;
        for (const handler of row.chain) mounted.add(handler);
    }
    return mounted;
};

describe('every controller reading the caller is mounted behind isAuth', () => {
    it('finds no handler asserting an auth context its route does not guarantee', () => {
        const offenders = moduleNames().flatMap((name) => {
            const reading = handlersReadingAuthContext(path.join(MODULES_ROOT, name));
            const router = ROUTED_MODULES[name];
            if (reading.size === 0 || router === undefined) return [];

            return [...handlersMountedUnauthenticated(router)]
                .filter((handler) => reading.has(handler))
                .map((handler) => `${name}: ${handler}`);
        });

        expect(offenders).toEqual([]);
    });

    it('actually finds controllers to check', () => {
        // A canary: an empty result must mean "all guarded", never "nothing was read".
        const total = moduleNames().reduce(
            (count, name) => count + handlersReadingAuthContext(path.join(MODULES_ROOT, name)).size,
            0
        );
        expect(total).toBeGreaterThan(10);
    });
});
