/**
 * @module
 * The demo profile's control surface — mounted only when `enableDemoProfile()` was called (see
 * `npm run demo`).
 *
 * Three routes for the paired frontend's e2e suite, all under `/__test/*`:
 *
 * `POST /__test/restore`   empty the database and put a named scenario back, clearing the outbox
 * `GET /__test/scenario`   what is currently restored: the logins, and a row id per guarantee name
 * `GET /__test/emails`     what the app "sent" since the last restore
 *
 * A scenario is BUILT once per process and REPLAYED thereafter — see {@link buildOnce}. App-tier
 * since it is the one tier `eslint-plugin-boundaries` lets reach `scenarios/`; unauthenticated
 * since the profile only ever binds beside a database `npm run demo` just created.
 */

import type { Express, Request, Response } from 'express';
import {
    captureDatabase,
    emptyDatabase,
    restoreDatabaseCopy,
    type DatabaseCopy
} from '@infrastructure/runtime/database';
import { clearDemoOutbox, readDemoOutbox } from '@infrastructure/adapters/demo-outbox';
import { clearCache } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { refreshLocaleOverrides } from '@infrastructure/i18n';

export { isDemoMode } from '@infrastructure/runtime/demo-profile';

/**
 * Thrown for anything `scenarios/index.ts`'s `SCENARIOS` registry does not carry — by
 * {@link restoreScenario} for an unknown name, and by {@link installDemo} for a `scenario` field
 * that is not even a string. Takes `unknown` so both share one message format.
 */
export class UnknownScenarioError extends Error {
    constructor(name: unknown) {
        super(`unknown scenario: ${JSON.stringify(name)}`);
    }
}

/** One scenario as this process built it: every row, and what each guarantee name points at. */
interface ScenarioCopy {
    /** The resolved name — `DEFAULT_SCENARIO` when the caller named none. */
    name: string;
    database: DatabaseCopy;
    subjects: Readonly<Record<string, string>>;
}

/** What has been built so far, by scenario name. A restore of a name in here is a replay. */
const copies = new Map<string, ScenarioCopy>();

/** The scenario last restored — what `GET /__test/scenario` is describing. */
let currentScenario: string | undefined;

/** The Express application, kept by {@link installDemo} for the flow runner's own listener. */
let demoApp: Express | undefined;

/**
 * Build `name` from scratch into the currently empty database, and keep a copy of the result.
 *
 * This is the expensive half of a restore, and the reason the copy exists at all: building `shop`
 * means fourteen bcrypt cost-12 hashes and then several hundred HTTP requests driving the real
 * checkout, payment, shipping and refund flows (`scenarios/flows/`). None of that is idempotent —
 * checking out twice makes two orders — so it happens once and every later restore replays the
 * rows it produced.
 *
 * Imported dynamically rather than at the top of this file: `app.ts` imports
 * `installDemo`/`isDemoMode` unconditionally, and a static import here would pull every module's
 * scenario factories into every process whether or not `enableDemoProfile()` is ever called — the
 * exact cost this file's split from `src/modules/*` exists to avoid. `DEFAULT_SCENARIO` is applied
 * here for the same reason: a static import of it would load the registry everywhere.
 *
 * Empties the database itself, and only on the path that actually builds: `buildScenario` assumes
 * an empty one, so the emptying belongs to the build rather than to every caller — a replay's own
 * emptying is `restoreDatabaseCopy`'s.
 *
 * @param name - the scenario to build, or `undefined` for the registry's `DEFAULT_SCENARIO`
 * @throws {UnknownScenarioError} for a name `SCENARIOS` does not carry
 * @throws {Error} when the scenario has flows to drive and `installDemo` never handed over an app
 */
const buildOnce = (name: string | undefined): Promise<ScenarioCopy> =>
    import('@scenarios/index').then((scenarios) => {
        const requested = name ?? scenarios.DEFAULT_SCENARIO;
        if (!scenarios.isScenarioName(requested)) throw new UnknownScenarioError(requested);

        const known = copies.get(requested);
        if (known) return known;

        return emptyDatabase()
            .then(() => scenarios.buildScenario(requested, demoApp))
            .then((subjects) =>
                captureDatabase().then((database) => {
                    const copy = { name: requested, database, subjects };
                    copies.set(requested, copy);
                    return copy;
                })
            );
    });

/**
 * Empty every collection and put `scenario` back — built the first time, replayed after that.
 *
 * One emptying per restore, and it is `restoreDatabaseCopy`'s own: whichever branch
 * {@link buildOnce} took, what lands here is a copy to write over a cleared database.
 *
 * Never `dropDatabase()`: that clears each model's index build along with the data, so the next
 * write racing an unbuilt unique index would succeed where it should have been refused — see
 * `emptyDatabase`'s own docblock.
 *
 * Serialised through {@link restoreQueue} rather than run as called: `installDemo` has no queue of
 * its own, and two overlapping restores emptying and reseeding the same collections concurrently
 * would interleave their writes — and two concurrent replays of one copy would collide on `_id`.
 *
 * @param scenario - which scenario to put back
 * @throws {UnknownScenarioError} for a name `SCENARIOS` does not carry
 */
const runRestore = (scenario: string | undefined): Promise<void> =>
    buildOnce(scenario)
        .then((copy) =>
            restoreDatabaseCopy(copy.database).then(() => {
                currentScenario = copy.name;
            })
        )
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
 * @param scenario - which scenario to seed; `undefined` takes the registry's own default.
 * @throws {UnknownScenarioError} for a name `SCENARIOS` does not carry
 */
export const restoreScenario = (scenario?: string): Promise<void> => {
    const outcome = restoreQueue.then(() => runRestore(scenario));
    restoreQueue = outcome.then(
        () => undefined,
        () => undefined
    );
    return outcome;
};

/**
 * What `GET /__test/scenario` answers: which scenario is loaded, the logins, and a row id per
 * guarantee name.
 *
 * `accounts` comes from `scenarios/accounts.ts` as the `NODE_SEED_*` overrides resolved it, so the
 * paired frontend never keeps a second copy of a password. `subjects` merges the pinned ids with
 * the ones the flow runner recorded at boot — which is the only way an order id can be published
 * at all, since orders are produced rather than written.
 */
const describeScenario = (): Promise<Record<string, unknown>> =>
    import('@scenarios/accounts').then((accounts) => ({
        scenario: currentScenario,
        accounts: accounts.seedCredentials,
        subjects: currentScenario ? (copies.get(currentScenario)?.subjects ?? {}) : {}
    }));

/** Mount the demo profile's routes. Only ever called when `enableDemoProfile()` was called. */
export const installDemo = (app: Express): void => {
    // Kept for `buildOnce`: the flow runner drives the real application over real HTTP, on a
    // throwaway loopback listener of its own (`scenarios/flows/loopback.ts`).
    demoApp = app;

    app.post('/__test/restore', (request: Request, response: Response) => {
        const requested: unknown = (request.body as { scenario?: unknown } | undefined)?.scenario;
        if (requested !== undefined && typeof requested !== 'string') {
            response.status(400).json({
                success: false,
                message: new UnknownScenarioError(requested).message
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

    app.get('/__test/scenario', (_request: Request, response: Response) => {
        describeScenario()
            .then((description) => response.json(description))
            .catch((error: unknown) => {
                logger.error({ message: 'scenario description failed', error });
                response.status(500).json({ success: false });
            });
    });

    app.get('/__test/emails', (_request: Request, response: Response) => {
        response.json({ emails: readDemoOutbox() });
    });
};
