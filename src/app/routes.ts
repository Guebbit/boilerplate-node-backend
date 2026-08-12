/**
 * Route mounting.
 *
 * Modules mount themselves: each one declares its `basePath` and router in its manifest, and this
 * install walks `enabledModules` without knowing a single domain name. The explicit imports that
 * remain are the domains that have not been made modules yet.
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
    /**
     * Registered modules, each at the base path its own manifest declares.
     *
     * A module without a router is skipped rather than treated as an error: `audit-logs` owns a
     * collection and no URL, and the manifest types that as a whole alternative, so there is no
     * half-declared case to catch here.
     */
    for (const appModule of enabledModules)
        if (appModule.routes) app.use(appModule.basePath, appModule.routes);

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
