/**
 * Every module that mounts a router, by name.
 *
 * Read from: the registry (`src/modules.ts`), not a list. A module that mounts a router has
 *            `mounts` on its manifest, so a new one is covered the moment it is enabled. A folder
 *            on disk but not in the registry is caught by `write-routes-are-guarded.test.ts`.
 * Own file:  not beside `@tests/routes`' helpers. Its mock factories (`cacheMock` and friends) are
 *            read with `jest.requireActual('@tests/routes')` from inside a `jest.mock(...)`
 *            factory, before those middlewares are mocked. Importing the real routers there would
 *            pull the real `rate-limit`/`cache`/`upload`/`route-flag` middlewares into that
 *            `requireActual`, a module still mid-evaluation while its own mock is defined, and
 *            each factory comes back `undefined`. Kept apart, it touches only pure helpers.
 * Mocks:     a consuming test still declares its own `jest.mock` calls for the middleware
 *            factories BEFORE importing this (see `@tests/routes`' header).
 */
import type { Router } from 'express';
import { enabledModules } from '../../src/modules';
import { routedModulesOf } from '@tests/routes';

/** Every routed module, keyed by directory name under `src/modules/`. */
export const ROUTED_MODULES: Record<string, Router> = routedModulesOf(enabledModules);

/**
 * Every router one module serves: its own and any it mounts under another resource's URL.
 * @param name - directory name under `src/modules/`
 * @returns the module's routers, empty for a module with none
 */
export const routersOfModule = (name: string): Router[] =>
    Object.entries(ROUTED_MODULES)
        .filter(([key]) => key.split('@', 1)[0] === name)
        .map(([, router]) => router);
