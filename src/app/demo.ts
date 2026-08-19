/**
 * The demo profile's control surface — mounted only when `NODE_DEMO=true` (see `npm run demo`).
 *
 * Two routes, both consumed by the paired frontend's e2e suite:
 *
 *   POST /__demo/reset    drop the in-memory database, reseed it from every enabled module's
 *                         demo fixtures, clear the email outbox — the deterministic
 *                         start-of-spec state, in-process and therefore fast enough to run
 *                         once per spec.
 *   GET  /__demo/emails   the emails the app "sent" since the last reset (see
 *                         `@infrastructure/adapters/demo-outbox`) — how a password-reset spec
 *                         reads its token.
 *
 * App-tier on purpose: reseeding walks `enabledModules`, and knowing every domain is exactly
 * what the app tier is for. The routes are unauthenticated because the profile only ever binds
 * beside an in-memory database that `npm run demo` created seconds earlier — there is nothing
 * to protect and no deployment that mounts them.
 */
import type { Express, Request, Response } from 'express';
import { connection } from '@infrastructure/runtime/database';
import { clearDemoOutbox, readDemoOutbox } from '@infrastructure/adapters/demo-outbox';
import { logger } from '@infrastructure/adapters/logger';
import { enabledModules } from '../modules';

export { isDemoMode } from '@infrastructure/adapters/demo-outbox';

/**
 * Drop everything and reseed from the modules' own demo fixtures — the same walk
 * `db/demo/index.ts --reset` performs, minus the CLI and the cache flush (the demo profile
 * runs with the cache disabled).
 *
 * @param reset - drop the database first; `false` seeds into whatever is there (first boot).
 */
export const runDemoSeed = (reset: boolean): Promise<void> =>
    (reset ? connection.dropDatabase() : Promise.resolve(true))
        .then(() =>
            Promise.all(
                enabledModules.map((appModule) => appModule.seeds?.() ?? Promise.resolve([]))
            )
        )
        .then(() => {
            clearDemoOutbox();
        });

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
