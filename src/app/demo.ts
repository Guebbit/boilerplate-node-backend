/**
 * @module
 * The demo profile's control surface — mounted only when `NODE_DEMO=true` (see `npm run demo`).
 * Two routes for the paired frontend's e2e suite: `POST /__test/restore` drops the database and
 * reseeds a named scenario from `scenarios/`, clearing the email outbox; `GET /__demo/emails`
 * reads back what the app "sent" since. App-tier since it is the one tier
 * `eslint-plugin-boundaries` lets reach `scenarios/`; unauthenticated since the profile only ever
 * binds beside a database `npm run demo` just created.
 */

import type { Express, Request, Response } from 'express';
import { connection } from '@infrastructure/runtime/database';
import { clearDemoOutbox, readDemoOutbox } from '@infrastructure/adapters/demo-outbox';
import { logger } from '@infrastructure/adapters/logger';
import { seedAccessModel } from '@kernel/access/seed';

export { isDemoMode } from '@infrastructure/adapters/demo-outbox';

/** The scenarios `POST /__test/restore` knows how to seed — `shop`, the full catalogue, or
 * `blank`, harness infrastructure only. See `scenarios/blank.ts`'s own docblock. */
export type ScenarioName = 'shop' | 'blank';

/**
 * Seed one named scenario into whatever database is currently connected. `shop` walks
 * `scenarios/index.ts`'s full table; `blank` is `scenarios/blank.ts`'s reduced one — roles, the
 * five named accounts and locales, no catalogue.
 *
 * Both imported dynamically rather than at the top of this file: `app.ts` imports
 * `installDemo`/`isDemoMode` unconditionally, and a static import here would pull every module's
 * demo factories into every process regardless of `NODE_DEMO` — the exact cost this file's split
 * from `src/modules/*` exists to avoid.
 */
const seedScenario = (scenario: ScenarioName): Promise<void> =>
    scenario === 'blank'
        ? import('@scenarios/blank').then(({ seedBlankScenario }) => seedBlankScenario())
        : seedAccessModel()
              .then(() => import('@scenarios/index'))
              .then(({ seedAllDemoModules }) => seedAllDemoModules())
              .then(() => undefined);

/**
 * Drop everything and reseed `scenario` — the same walk `scenarios/apply.ts --reset` performs for
 * `shop`, minus the CLI and the cache flush (the demo profile runs with the cache disabled).
 *
 * @param reset - drop the database first; `false` seeds into whatever is there (first boot).
 * @param scenario - which scenario to seed; defaults to `shop`.
 */
export const restoreScenario = (reset: boolean, scenario: ScenarioName = 'shop'): Promise<void> =>
    (reset ? connection.dropDatabase() : Promise.resolve(true))
        .then(() => seedScenario(scenario))
        .then(() => {
            clearDemoOutbox();
        });

/** `true` for a value naming a scenario {@link restoreScenario} actually knows how to seed. */
const isScenarioName = (value: unknown): value is ScenarioName =>
    value === 'shop' || value === 'blank';

/** Mount the demo profile's two routes. Only ever called when `NODE_DEMO=true`. */
export const installDemo = (app: Express): void => {
    app.post('/__test/restore', (request: Request, response: Response) => {
        const requested: unknown = (request.body as { scenario?: unknown } | undefined)?.scenario;
        if (requested !== undefined && !isScenarioName(requested)) {
            response
                .status(400)
                .json({ success: false, message: `unknown scenario: ${JSON.stringify(requested)}` });
            return;
        }

        restoreScenario(true, requested)
            .then(() => response.status(204).end())
            .catch((error: unknown) => {
                logger.error({ message: 'scenario restore failed', error });
                response.status(500).json({ success: false });
            });
    });

    app.get('/__demo/emails', (_request: Request, response: Response) => {
        response.json({ emails: readDemoOutbox() });
    });
};
