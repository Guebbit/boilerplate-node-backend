/**
 * Route mounting.
 *
 * Modules mount themselves: each one declares its `basePath` and router in its manifest, and this
 * install walks `enabledModules` without knowing a single domain name. Every domain is a module,
 * so the walk is the whole of the domain mounting — the one explicit import is `system-routes`,
 * which is not a domain: it serves the contract, the docs and the root redirect, none of which
 * belong to anybody's business logic.
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
     * collection and no URL. `basePath` and `routes` are meaningless apart, so both are required
     * here — a manifest carrying one without the other serves nothing, which is what a router with
     * no mount point was always going to do.
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
