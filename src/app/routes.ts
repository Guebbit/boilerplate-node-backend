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
     * Registered modules, each at the base path its own manifest declares.
     *
     * A module without a router is skipped rather than treated as an error: `access` owns the
     * membership/role assignment data and no URL of its own — every route that touches it goes
     * through `account`, `api-keys` or `users` instead. `basePath` and `routes` are meaningless
     * apart, so both are required here — a manifest carrying one without the other serves nothing,
     * which is what a router with no mount point was always going to do.
     */
    for (const { basePath, routes } of enabledModules)
        if (basePath && routes) app.use(basePath, routes);

    /**
     * REST API routes — domain-driven routing.
     */
    app.use('/', systemRoutes);

    /**
     * 404 handler — unmatched routes.
     */
    app.use((request: Request, response: Response) => {
        rejectResponse(response, 404);
    });
};
