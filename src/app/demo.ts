/**
 * @module
 * The demo profile's control surface — mounted only when `enableDemoProfile()` was called (see
 * `npm run demo`).
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
import type { ScenarioName } from '@scenarios/index';

export { isDemoMode } from '@infrastructure/adapters/demo-outbox';

/** Thrown by {@link restoreScenario} for a name `scenarios/index.ts`'s `SCENARIOS` registry does
 * not carry. */
export class UnknownScenarioError extends Error {
    constructor(name: string) {
        super(`unknown scenario: ${JSON.stringify(name)}`);
    }
}

/**
 * Seed one named scenario into whatever database is currently connected —
 * `scenarios/index.ts`'s `SCENARIOS` registry says which names exist and how to seed each.
 *
 * Imported dynamically rather than at the top of this file: `app.ts` imports
 * `installDemo`/`isDemoMode` unconditionally, and a static import here would pull every module's
 * scenario factories into every process whether or not `enableDemoProfile()` is ever called — the
 * exact cost this file's split from `src/modules/*` exists to avoid.
 *
 * @throws {UnknownScenarioError} for a name `SCENARIOS` does not carry
 */
const seedScenario = (name: string): Promise<void> =>
    import('@scenarios/index').then(({ SCENARIOS }) => {
        if (!Object.hasOwn(SCENARIOS, name)) throw new UnknownScenarioError(name);
        // `Object.hasOwn` above narrows against `SCENARIOS`'s keys, not `name`'s own type — the
        // cast states what the guard already proved.
        return SCENARIOS[name as ScenarioName]().then(() => undefined);
    });

/**
 * Empty every collection and reseed `scenario` — the same walk `scenarios/apply.ts --reset`
 * performs for `shop`. Never `dropDatabase()`: that clears each model's index build along with the
 * data, so the next write racing an unbuilt unique index would succeed where it should have been
 * refused — see `emptyDatabase`'s own docblock. Always empties first, even at boot: free on a
 * fresh in-memory database, and it is what lets this take a bare name instead of a caller-supplied
 * flag.
 *
 * Serialised through {@link restoreQueue} rather than run as called: `installDemo` has no queue of
 * its own, and two overlapping restores emptying and reseeding the same collections concurrently
 * would interleave their writes.
 *
 * @param scenario - which scenario to seed
 * @throws {UnknownScenarioError} for a name `SCENARIOS` does not carry
 */
const runRestore = (scenario: string): Promise<void> =>
    emptyDatabase()
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
 *
 * @param scenario - which scenario to seed; defaults to `shop`.
 * @throws {UnknownScenarioError} for a name `SCENARIOS` does not carry
 */
export const restoreScenario = (scenario = 'shop'): Promise<void> => {
    const outcome = restoreQueue.then(() => runRestore(scenario));
    restoreQueue = outcome.then(
        () => undefined,
        () => undefined
    );
    return outcome;
};

/** Mount the demo profile's two routes. Only ever called when `enableDemoProfile()` was called. */
export const installDemo = (app: Express): void => {
    app.post('/__test/restore', (request: Request, response: Response) => {
        const requested: unknown = (request.body as { scenario?: unknown } | undefined)?.scenario;
        if (requested !== undefined && typeof requested !== 'string') {
            response.status(400).json({
                success: false,
                message: `unknown scenario: ${JSON.stringify(requested)}`
            });
            return;
        }

        restoreScenario(requested)
            .then(() => response.status(204).end())
            .catch((error: unknown) => {
                if (error instanceof UnknownScenarioError) {
                    response.status(400).json({ success: false, message: error.message });
                    return;
                }
                logger.error({ message: 'scenario restore failed', error });
                response.status(500).json({ success: false });
            });
    });

    app.get('/__test/emails', (_request: Request, response: Response) => {
        response.json({ emails: readDemoOutbox() });
    });
};
