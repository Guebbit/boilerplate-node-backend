/**
 * @module
 * Route mounting. Modules mount themselves: each declares its `basePath` and router in its
 * manifest, and this install walks `enabledModules` without knowing a single domain name. The one
 * explicit import is `system-routes`, which is not a domain — it serves the root ping, which
 * belongs to nobody's business logic.
 */

import type { Express, Request, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import { enabledModules } from '../modules';
import { methodNotAllowed } from '@infrastructure/http/middlewares/method-not-allowed';
import { OPERATION_ROUTES } from '@api/operation-routes';

import { router as systemRoutes } from './system-routes';

/**
 * Mount every domain router, then the 404 catch-all.
 *
 * The catch-all is part of this install rather than the error handling one because it depends on
 * the mounts above: it has to be the last route registered, and separating the two would let a
 * later mount slip in behind it and never be reached.
 *
 * @param app - the express application to configure
 */
export const installRoutes = (app: Express): void => {
    /*
     * `no-store` unless a route says otherwise: a response is uncacheable by default, so one that
     * carries a secret (a minted API key, a webhook secret, an audit page) can never be kept by a
     * shared cache or a browser's disk because someone forgot an opt-in.
     *
     * Here and not in `installSecurity`: `installStatic` runs between the two, so a header set
     * earlier would strip the year-long cache from every image. The bare header, not the `noStore`
     * middleware: that one marks the response, and `setCache` refuses a route carrying the mark.
     * `setCache` and `privateNoCache` simply overwrite this on the routes that do cache.
     * https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
     */
    app.use((_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
    });

    /**
     * 405 + `Allow` for a literal contract path (no `{param}`) asked with a method it does not
     * declare. Before the routers: otherwise `DELETE /products/categories` reaches the
     * `/products/:id` handler and answers 404, where the contract matches the literal path first.
     */
    const servedModules = new Set(enabledModules.map(({ name }) => name));
    app.use(methodNotAllowed(OPERATION_ROUTES, servedModules, true));

    /**
     * Registered modules, each at the base path its own manifest declares.
     *
     * A module without a router is skipped rather than treated as an error: `access` owns the
     * membership/role assignment data and no URL of its own — every route that touches it goes
     * through `account`, `api-keys` or `users` instead. `basePath` and `routes` are meaningless
     * apart, so a mount carries both — a router with no mount point serves nothing.
     */
    for (const { mounts = [] } of enabledModules)
        for (const { basePath, routes } of mounts) app.use(basePath, routes);

    /**
     * REST API routes — domain-driven routing.
     */
    app.use('/', systemRoutes);

    /**
     * 405 + `Allow` for a contract path asked with another method; anything else falls through
     * to the 404 below. Only the modules this build mounts count as known paths.
     */
    app.use(methodNotAllowed(OPERATION_ROUTES, servedModules));

    /**
     * 404 handler — unmatched routes.
     */
    app.use((request: Request, response: Response) => {
        rejectResponse(response, 404);
    });
};
