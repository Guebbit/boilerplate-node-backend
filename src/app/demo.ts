/**
 * @module
 * The demo profile's control surface — mounted only when `NODE_DEMO=true` (see `npm run demo`).
 * Two routes for the paired frontend's e2e suite, both under `/__test/*`: `POST /__test/restore`
 * empties the database and reseeds a named scenario from `scenarios/`, clearing the email outbox;
 * `GET /__test/emails` reads back what the app "sent" since. App-tier since it is the one tier
 * `eslint-plugin-boundaries` lets reach `scenarios/`; unauthenticated since the profile only ever
 * binds beside a database `npm run demo` just created.
 */

import type { Express, Request, Response } from 'express';
import { emptyDatabase } from '@infrastructure/runtime/database';
import { clearDemoOutbox, readDemoOutbox } from '@infrastructure/adapters/demo-outbox';
import { clearCache } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { refreshLocaleOverrides } from '@infrastructure/i18n';
import { seedAccessModel } from '@kernel/access/seed';

export { isDemoMode } from '@infrastructure/adapters/demo-outbox';

/** The scenarios `POST /__test/restore` knows how to seed — `shop`, the full catalogue, or
 * `blank`, harness infrastructure only. See `scenarios/blank.ts`'s own docblock. */
export type ScenarioName = 'shop' | 'blank';

/**
 * Seed one named scenario into whatever database is currently connected. `shop` walks
 * `scenarios/index.ts`'s full table; `blank` is `scenarios/blank.ts`'s reduced one — roles, the
 * four named accounts and locales, no catalogue.
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
 * Empty every collection and reseed `scenario` — the same walk `scenarios/apply.ts --reset`
 * performs for `shop`. Never `dropDatabase()`: that clears each model's index build along with the
 * data, so the next write racing an unbuilt unique index would succeed where it should have been
 * refused — see `emptyDatabase`'s own docblock.
 *
 * Serialised through {@link restoreQueue} rather than run as called: `installDemo` has no queue of
 * its own, and two overlapping restores emptying and reseeding the same collections concurrently
 * would interleave their writes.
 *
 * @param reset - empty the database first; `false` seeds into whatever is there (first boot).
 * @param scenario - which scenario to seed; defaults to `shop`.
 */
const runRestore = (reset: boolean, scenario: ScenarioName = 'shop'): Promise<void> =>
    (reset ? emptyDatabase() : Promise.resolve())
        .then(() => seedScenario(scenario))
        .then(() => {
            clearDemoOutbox();
        })
        .then(() => refreshLocaleOverrides())
        .then(() => clearCache())
        .then(() => undefined);

/** The tail of every restore issued so far — each new one chains onto it instead of racing it. */
let restoreQueue: Promise<void> = Promise.resolve();

/**
 * {@link runRestore}, queued behind whatever restore is already running.
 *
 * A failed restore must not wedge the ones behind it, so the queue itself never rejects — each
 * caller still sees its own restore's outcome through the promise this returns.
 */
export const restoreScenario = (reset: boolean, scenario: ScenarioName = 'shop'): Promise<void> => {
    const outcome = restoreQueue.then(() => runRestore(reset, scenario));
    restoreQueue = outcome.then(
        () => undefined,
        () => undefined
    );
    return outcome;
};

/** `true` for a value naming a scenario {@link restoreScenario} actually knows how to seed. */
const isScenarioName = (value: unknown): value is ScenarioName =>
    value === 'shop' || value === 'blank';

/** Mount the demo profile's two routes. Only ever called when `NODE_DEMO=true`. */
export const installDemo = (app: Express): void => {
    app.post('/__test/restore', (request: Request, response: Response) => {
        const requested: unknown = (request.body as { scenario?: unknown } | undefined)?.scenario;
        if (requested !== undefined && !isScenarioName(requested)) {
            response.status(400).json({
                success: false,
                message: `unknown scenario: ${JSON.stringify(requested)}`
            });
            return;
        }

        restoreScenario(true, requested)
            .then(() => response.status(204).end())
            .catch((error: unknown) => {
                logger.error({ message: 'scenario restore failed', error });
                response.status(500).json({ success: false });
            });
    });

    app.get('/__test/emails', (_request: Request, response: Response) => {
        response.json({ emails: readDemoOutbox() });
    });
};
