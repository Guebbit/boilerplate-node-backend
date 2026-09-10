/**
 * @module
 * The demo profile's control surface — mounted only when `NODE_DEMO=true` (see `npm run demo`).
 * Two routes for the paired frontend's e2e suite: `POST /__demo/reset` reseeds the in-memory
 * database from `demo/`'s fixtures and clears the email outbox; `GET /__demo/emails` reads
 * back what the app "sent" since. App-tier since it is the one tier `eslint-plugin-boundaries`
 * lets reach `demo/`; unauthenticated since the profile only ever binds beside a database
 * `npm run demo` just created.
 */

import type { Express, Request, Response } from 'express';
import { connection } from '@infrastructure/runtime/database';
import { clearDemoOutbox, readDemoOutbox } from '@infrastructure/adapters/demo-outbox';
import { logger } from '@infrastructure/adapters/logger';
import { seedAccessModel } from '@kernel/access/seed';

export { isDemoMode } from '@infrastructure/adapters/demo-outbox';

/**
 * Drop everything and reseed from `demo/`'s own fixtures — the same walk `db/demo/index.ts --reset`
 * performs, minus the CLI and the cache flush (the demo profile runs with the cache disabled).
 *
 * `demo/index.ts` is imported dynamically rather than at the top of this file: `app.ts` imports
 * `installDemo`/`isDemoMode` unconditionally, and a static import here would pull every module's
 * demo fixtures into every process regardless of `NODE_DEMO` — the exact cost this file's split
 * from `src/modules/*` exists to avoid.
 *
 * @param reset - drop the database first; `false` seeds into whatever is there (first boot).
 */
export const runDemoSeed = (reset: boolean): Promise<void> =>
    (reset ? connection.dropDatabase() : Promise.resolve(true))
        // The shop, the preset roles and the demo memberships first: a module's fixtures may be
        // written in any order, but nothing can resolve a caller until there is a shop to be a
        // member of.
        .then(() => seedAccessModel())
        .then(() => import('@demo/index'))
        .then(({ seedAllDemoModules }) => seedAllDemoModules())
        .then(() => {
            clearDemoOutbox();
        });

/** Mount the demo profile's two routes. Only ever called when `NODE_DEMO=true`. */
export const installDemo = (app: Express): void => {
    app.post('/__demo/reset', (_request: Request, response: Response) => {
        runDemoSeed(true)
            .then(() => response.status(204).end())
            .catch((error: unknown) => {
                logger.error({ message: 'demo reset failed', error });
                response.status(500).json({ success: false });
            });
    });

    app.get('/__demo/emails', (_request: Request, response: Response) => {
        response.json({ emails: readDemoOutbox() });
    });
};
