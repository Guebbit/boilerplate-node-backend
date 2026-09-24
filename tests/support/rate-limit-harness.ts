/**
 * A trivial app for driving a rate limiter in isolation, over real HTTP.
 *
 * Neither of `tests/support/express.ts`'s stub (no real middleware runs) nor `tests/support/http.ts`'s
 * fully mounted app (routing, auth and serialization the property under test has nothing to do
 * with) fits: a limiter's behaviour is a property of `express-rate-limit`'s own middleware, which
 * `no-restricted-imports` treats as an integration concern — see e.g.
 * `src/modules/account/tests/integration/identity-rate-limit.test.ts` and its feedback-module
 * twin.
 */

import express from 'express';
import type { RequestHandler } from 'express';
import type supertest from 'supertest';
import { withEnvironmentOverrides } from './environment';

/**
 * Reload a rate-limit module with the given variables set, and pick what the case needs out of
 * it.
 *
 * `express-rate-limit` reads its options ONCE, at construction, so a limiter's budget is fixed
 * the moment its module is first imported — by which time `tests/support/setup.ts` has already
 * raised every budget to keep unrelated suites off the limiter. A case that wants a small budget
 * therefore has to discard the module registry and import again, with the variables in place.
 *
 * `withEnvironmentOverrides` rather than a hand-rolled save/restore: it puts the environment back
 * whether the import resolved or threw, and a variable left changed fails a LATER case in the
 * file rather than this one.
 *
 * @param modulePath - loader for the rate-limit module, e.g. `() => import('@modules/account/rate-limits')`
 * @param overrides - variable name → value, for the duration of the import
 * @param pick - takes the freshly-loaded module, returns the limiters the case drives
 * @returns whatever `pick` returned, from the new module instance
 */
export const withReloadedRateLimits = <TModule, TPicked>(
    modulePath: () => Promise<TModule>,
    overrides: Record<string, string>,
    pick: (rateLimitsModule: TModule) => TPicked
): Promise<TPicked> =>
    withEnvironmentOverrides(overrides, () => {
        jest.resetModules();
        return modulePath().then(pick);
    });

/**
 * A trivial app that always answers `status`, past the given limiter chain.
 *
 * @param trustProxyHop - whether `X-Forwarded-For` should become `request.ip`, the way
 *   `NODE_TRUST_PROXY_HOPS` configures it in the real app — only the address-BLOCK dimension
 *   needs it. See docs/tools/security.md#trust-proxy-and-the-two-ways-to-get-it-wrong.
 */
export const appAnswering = (
    status: number,
    trustProxyHop: boolean,
    ...limiters: RequestHandler[]
): express.Express => {
    const app = express();
    if (trustProxyHop) app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/route', ...limiters, (_request, response) => {
        response.status(status).json({});
    });
    return app;
};

/** The response status of a pending supertest request, without accessing it on the await itself. */
export const statusOf = async (pending: supertest.Test): Promise<number> => {
    const response = await pending;
    return response.status;
};
