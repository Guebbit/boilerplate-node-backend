/**
 * @module
 * The demo profile's control surface — mounted only by `scenarios/run-server.ts`, which hands
 * {@link installDemo} and {@link restoreScenario} to `createApp` as its extension (`npm run
 * demo`). Nothing under `src/` knows it exists: production has no such routes to mount.
 *
 * Six routes for the paired frontend's e2e suite, all under `/__test/*`:
 *
 * `POST /__test/restore`   empty the database and put a named scenario back, clearing the outbox
 *                          and putting the clock back to real time
 * `GET /__test/scenario`   what is currently restored: the logins, and a row id per guarantee name
 * `GET /__test/emails`     what the app "sent" since the last restore
 * `GET /__test/clock`      the demo clock: what `Date.now()` answers, and how far ahead of real time
 * `POST /__test/clock`     move it FORWARD by `advanceMs` (never back); a job that should react
 *                          is then triggered through its own door, e.g. the reservation sweep
 * `POST /__test/jobs/:name` run one background job now (`scenarios/jobs.ts`), e.g. `reap-orders`
 *
 * A scenario is BUILT once per process and REPLAYED thereafter — see {@link buildOnce}.
 * Unauthenticated since the profile only ever binds beside a database `npm run demo` just created.
 */

import type { Express, Request, Response } from 'express';
import { clearCache } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { refreshLocaleOverrides } from '@infrastructure/i18n';
import { seedCredentials } from '@scenarios/accounts';
import { DEFAULT_SCENARIO, buildScenario, isScenarioName } from '@scenarios/index';
import { DEMO_JOBS } from '@scenarios/jobs';
import {
    captureDatabase,
    emptyDatabase,
    restoreDatabaseCopy,
    type DatabaseCopy
} from './database-snapshot';
import { getDemoClock } from './demo-clock';
import { clearDemoOutbox, readDemoOutbox } from './doubles/mail-outbox';

/**
 * Thrown for anything `scenarios/index.ts`'s `SCENARIOS` registry does not carry — by
 * {@link restoreScenario} for an unknown name, and by {@link installDemo} for a `scenario` field
 * that is not even a string. Takes `unknown` so both share one message format.
 */
export class UnknownScenarioError extends Error {
    /** @param name - whatever the caller sent as the scenario name, rendered with `JSON.stringify`. */
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
 * Empties the database itself, and only on the path that actually builds: `buildScenario` assumes
 * an empty one, so the emptying belongs to the build rather than to every caller — a replay's own
 * emptying is `restoreDatabaseCopy`'s.
 *
 * @param name - the scenario to build, or `undefined` for the registry's `DEFAULT_SCENARIO`
 * @throws {UnknownScenarioError} for a name `SCENARIOS` does not carry
 * @throws {Error} when the scenario has flows to drive and `installDemo` never handed over an app
 */
const buildOnce = (name: string | undefined): Promise<ScenarioCopy> =>
    Promise.resolve().then(() => {
        const requested = name ?? DEFAULT_SCENARIO;
        if (!isScenarioName(requested)) throw new UnknownScenarioError(requested);

        const known = copies.get(requested);
        if (known) return known;

        return emptyDatabase()
            .then(() => buildScenario(requested, demoApp))
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
            // A time-travelling spec must not leave its future behind for the next one.
            getDemoClock()?.reset();
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
const describeScenario = (): Record<string, unknown> => ({
    scenario: currentScenario,
    accounts: seedCredentials,
    subjects: currentScenario ? (copies.get(currentScenario)?.subjects ?? {}) : {}
});

/** Mount the demo profile's routes — `createApp`'s `extension.install`, called by `run-server.ts` alone. */
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
                // Stryker disable next-line all
                logger.error({ message: 'scenario restore failed', error });
                response.status(500).json({ success: false });
            });
    });

    app.get('/__test/scenario', (_request: Request, response: Response) => {
        response.json(describeScenario());
    });

    app.get('/__test/clock', (_request: Request, response: Response) => {
        const clock = getDemoClock();
        if (!clock) {
            response
                .status(501)
                .json({ success: false, message: 'this profile has no demo clock' });
            return;
        }
        response.json({ now: clock.now().toISOString(), offsetMs: clock.offsetMs() });
    });

    app.post('/__test/clock', (request: Request, response: Response) => {
        const clock = getDemoClock();
        if (!clock) {
            response
                .status(501)
                .json({ success: false, message: 'this profile has no demo clock' });
            return;
        }

        const advanceMs: unknown = (request.body as { advanceMs?: unknown } | undefined)?.advanceMs;
        if (typeof advanceMs !== 'number' || !Number.isFinite(advanceMs) || advanceMs < 0) {
            response
                .status(400)
                .json({ success: false, message: 'advanceMs must be a non-negative number' });
            return;
        }

        clock.advance(advanceMs);
        response.json({ now: clock.now().toISOString(), offsetMs: clock.offsetMs() });
    });

    app.post('/__test/jobs/:name', (request: Request, response: Response) => {
        // Express types a route parameter as `string | string[]`; this route has one plain segment.
        const name = String(request.params.name);

        Promise.resolve()
            .then(() => {
                const job = DEMO_JOBS.get(name);
                if (!job) {
                    response.status(404).json({ success: false, message: `unknown job: ${name}` });
                    return undefined;
                }
                return job().then((result) => {
                    response.json({ job: name, result });
                });
            })
            .catch((error: unknown) => {
                // Stryker disable next-line all
                logger.error({ message: 'demo job failed', job: name, error });
                response.status(500).json({ success: false });
            });
    });

    app.get('/__test/emails', (_request: Request, response: Response) => {
        response.json({ emails: readDemoOutbox() });
    });
};
