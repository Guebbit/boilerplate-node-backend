/**
 * @module
 * Every endpoint mounted across the whole app, method + absolute path + effective guard chain —
 * the contract layer's view of {@link effectiveRouteTable}. Kept out of `@tests/routes` because
 * `enabledModules` pulls in every module's event subscriptions and demo seeding, a cost the
 * per-module route unit tests have no reason to pay.
 */
import type { Router } from 'express';
import { effectiveRouteTable } from '@tests/routes';
import { enabledModules } from '../../src/modules';

/** One mounted endpoint, as {@link everyMountedRoute} reports it. */
export interface MountedRoute {
    /** Uppercased HTTP method — `GET`, `POST`, … */
    method: string;
    /** Absolute path, module `basePath` plus the router's own — `/inventory/:id`, never relative. */
    path: string;
    /** Router-level and per-route guards, in the order they actually run. */
    guards: string[];
}

/**
 * Walks each enabled module's own router rather than the assembled `app`: `app.use(basePath,
 * router)` nests a module as one opaque middleware layer, and {@link effectiveRouteTable} only
 * reads a flat router's own routes — the same reason `routes.test.ts` walks modules individually.
 *
 * @returns one row per method/path pair mounted by any enabled module
 */
export const everyMountedRoute = (): MountedRoute[] =>
    enabledModules
        .filter((appModule): appModule is typeof appModule & { basePath: string; routes: Router } =>
            Boolean(appModule.basePath && appModule.routes)
        )
        .flatMap((appModule) =>
            effectiveRouteTable(appModule.routes).map(({ method, path, applies, chain }) => ({
                method,
                path: `${appModule.basePath}${path}`,
                guards: [...applies, ...chain]
            }))
        );
