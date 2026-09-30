/**
 * Every module that mounts a router, by name.
 *
 * Read off the registry (`src/modules.ts`) rather than listed: a module that mounts a router has
 * `routes` on its manifest, so a new one is covered the moment it is enabled. A module folder that
 * is on disk but not in the registry is caught by `write-routes-are-guarded.test.ts` instead of
 * going silently unguarded.
 *
 * A separate file from `@tests/routes` on purpose, not beside its other helpers: that file's
 * mock factories (`cacheMock` and friends) are read back with `jest.requireActual('@tests/routes')`
 * from inside a `jest.mock(...)` factory, before those middlewares are mocked. Importing the real
 * routers there would drag the real `rate-limit`/`cache`/`upload`/`route-flag` middlewares into
 * that same `requireActual` — a module still mid-evaluation while its own mock is being defined —
 * and each factory comes back `undefined`. Kept apart, `requireActual('@tests/routes')` touches
 * nothing but pure helpers.
 *
 * A consuming test file must still declare its own `jest.mock` calls for the middleware
 * factories BEFORE importing this, the same as it would importing any of these routers directly
 * — see `@tests/routes`'s own header for why.
 */
import type { Router } from 'express';
import { enabledModules } from '../../src/modules';
import { routedModulesOf } from '@tests/routes';

/** Every routed module, keyed by directory name under `src/modules/`. */
export const ROUTED_MODULES: Record<string, Router> = routedModulesOf(enabledModules);
