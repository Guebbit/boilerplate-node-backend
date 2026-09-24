/*
 * Scenario seeder — `npm run scenario:apply`. Owns DATA; `db:sync` owns SCHEMA.
 *
 * The RUNNER, not the scenario: the gates, the connection, and one call into `buildScenario`.
 * `scenarios/index.ts`'s registry is the table of what that builds.
 *
 * Boots the app in-process:  `shop` LIVES its history by driving the real checkout, payment,
 *                            shipping and refund endpoints (`scenarios/flows/`), which exist only
 *                            behind the real middleware stack. `NODE_APP_NO_LISTEN` keeps
 *                            `src/app.ts` off `NODE_PORT` — a container boot runs this BEFORE the
 *                            server it seeds for, so the flows get a loopback listener instead.
 * Refuses production:        a boot-time seeder that can drop or overwrite one is a footgun.
 * Refuses a public password: outside development/test, where a fixed demo login is the point.
 * Refuses a non-empty one:   unless `--reset`. Driving a checkout twice makes two orders.
 * Plain-text passwords:      the model's pre-save hook hashes them; a hash written by hand here
 *                            would drift from that hook, its plaintext unrecoverable.
 *
 * Usage:
 *   npm run scenario:apply [scenario]          # seed an empty database; defaults to `shop`
 *   npm run scenario:apply:reset [scenario]    # empty it first
 *   npm run scenario:apply -- --describe-to=x  # also write the accounts and subjects to `x`
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { emptyDatabase, isDatabaseEmpty } from '@infrastructure/runtime/database-snapshot';
import { clearCache } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from '../scripts/run-script';
import { DEFAULT_SCENARIO, isScenarioName, buildScenario } from '@scenarios/index';
import { hasFallbackSeedPassword, seedCredentials } from '@scenarios/accounts';
import { DEMO_BANK_TRANSFER, SCRIPTED_RATE_LIMITS } from '@scenarios/rate-limits';

/*
 * Read at IMPORT time by `src/app.ts`'s auto-start, so it has to be set before the dynamic import
 * below ever runs — and at the top level, so the cleanup path cannot import the app without it.
 * This script wants the Express instance, never a bound `NODE_PORT`.
 */
process.env.NODE_APP_NO_LISTEN = '1';

/*
 * OVERRIDES `.env`, which is the whole point: a deployment's budgets are sized for a person, and
 * this makes several hundred requests from one address in seconds. Left alone, the auth rung
 * refuses the shop owner's very first login and the build dies on a 429 that names none of this.
 *
 * Safe because of the production gate below — and because `buildRateLimiter` reads `process.env`
 * once, when the middleware is wired up during the dynamic `import('../src/app')` below, never
 * per request. Setting these here, before that import ever runs, binds only the app this process
 * is about to boot, for as long as the seed takes. `dotenv/config` above has already run and
 * never overwrites a key that is present.
 */
Object.assign(process.env, SCRIPTED_RATE_LIMITS);

/*
 * A seed PLACES orders, and every one of them wants to email a confirmation — to addresses this
 * file invented. Against a deployment with a mail server configured that is thirty real send
 * attempts to fictional recipients, which is both noise and a reputation risk that belongs to
 * nobody. `log` renders each one (so a broken template still fails here) and opens no socket.
 *
 * Overridden rather than defaulted, same as the budgets above: `.env` naming a real mail server
 * is exactly the case this protects against.
 */
process.env.NODE_MAIL_TRANSPORT = 'log';

/*
 * Applied only where nothing is set, unlike the budgets above: a deployment that names its own
 * beneficiary keeps it, and one that names none still gets a shop whose `order.awaitingTransfer`
 * guarantee can hold.
 */
for (const [key, value] of Object.entries(DEMO_BANK_TRANSFER)) process.env[key] ??= value;

/** `--reset`: empty the database before building, rather than refusing a non-empty one. */
const reset = process.argv.includes('--reset');

/** The one positional argument this CLI takes — everything else is a `--flag`. */
const scenarioArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));

/**
 * `--describe-to=<file>`: where to write the JSON the demo profile's `GET /__test/scenario`
 * serves — the accounts and the subject ids.
 *
 * A file rather than stdout, because `npm run` prints its own banner lines there and the paired
 * frontend's live-profile reset has to parse what comes back. It is the only way a LIVE backend
 * can describe its own dataset: `/__test/*` is never mounted on one.
 */
const describeTo = process.argv
    .find((argument) => argument.startsWith('--describe-to='))
    ?.slice('--describe-to='.length);

/** The application, once {@link seed} has booted it — what the cleanup below has to shut down. */
let application: typeof import('../src/app') | undefined;

/** Import the app, connect everything a request needs, and hand back its Express instance. */
const bootAppInProcess = () =>
    import('../src/app').then((imported) => {
        application = imported;
        return imported.bootInfrastructure().then(() => imported.app);
    });

/** Boots the app, refuses the unsafe cases, then builds and applies the named scenario. */
async function seed() {
    /* A boot-time seeder that can drop or overwrite a production database is a footgun. */
    if (process.env.NODE_ENV === 'production') {
        logger.warn('scenario:apply refused to run: NODE_ENV is production.');
        return;
    }

    if (scenarioArgument !== undefined && !isScenarioName(scenarioArgument)) {
        logger.warn(`scenario:apply refused to run: unknown scenario "${scenarioArgument}".`);
        return;
    }

    const scenarioName = scenarioArgument ?? DEFAULT_SCENARIO;

    /*
     * Outside development/test, a still-public password is the one thing this refuses: a
     * reachable staging database seeded with `root@root.it` / `Demo-Admin1!` hands out both the
     * shop owner and the platform operator to anyone who reads this repo. Development and test
     * are exempt because that is the whole point of a fixed, documented demo login — `npm run
     * demo` and CI both run there, and neither is reachable by anyone this refusal protects
     * against.
     */
    const isDevelopmentOrTest =
        process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    if (!isDevelopmentOrTest && hasFallbackSeedPassword()) {
        logger.warn(
            'scenario:apply refused to run: a seed account is still using its public fallback password outside development/test. Set every NODE_SEED_*_PASSWORD first.'
        );
        return;
    }

    const app = await bootAppInProcess();

    if (reset) {
        await emptyDatabase();
        logger.info('Database emptied.');
    } else if (!(await isDatabaseEmpty())) {
        /*
         * Warn and succeed, never throw: the compose `app` command is
         * `npm run db:bootstrap && <start the server>`, so a non-zero exit here would stop a
         * container whose database is already seeded from ever starting.
         */
        logger.info(
            `Seeding skipped: the database already holds data. Use "npm run scenario:apply:reset ${scenarioName}" to rebuild it.`
        );
        return;
    }

    /*
     * `buildScenario` owns the whole scenario — the access model, every module's rows, the flow
     * run against `app`, and the backdating pass after it. This runner names no scenario
     * internals: it only calls whatever the registry maps the name to.
     * `tests/cross-cutting/scenario-fixtures.test.ts` refuses a `shopModules` entry left behind
     * after the module it names is deleted.
     */
    const subjects = await buildScenario(scenarioName, app);

    /*
     * The flows wrote through the API, so most of this is already invalidated — but the module
     * fixtures underneath them went straight to Mongo, and those answers are still cached.
     *
     * Fails open, deliberately: seeding must succeed against a stack whose Redis is not up.
     * `reachable` is therefore read but never thrown on — it only decides which line gets
     * logged, so the fail-open is visible in the output instead of silently looking like a
     * cache that happened to be empty.
     */
    const { deleted, reachable } = await clearCache();
    if (reachable) logger.info(`Cache cleared after seeding: ${deleted} keys removed.`);
    else
        logger.warn(
            'Cache NOT cleared after seeding: Redis is unreachable. Seeding succeeded, but ' +
                'pre-seed responses will keep being served until their TTL expires.'
        );

    if (describeTo) {
        await writeFile(
            describeTo,
            JSON.stringify({ scenario: scenarioName, accounts: seedCredentials, subjects }, null, 2)
        );
        logger.info(`Scenario description written to ${describeTo}.`);
    }

    logger.info(`Seeding "${scenarioName}" complete.`);
}

/*
 * Cleanup lives in the runner's `finally`, not at the end of `seed()`: a throw partway through
 * would otherwise skip it and leave the Mongo and Redis sockets open, hanging the process.
 * `stopServer` closes everything `bootInfrastructure` opened, the locale-refresh interval
 * included. Nothing to do when a gate returned before the app was ever imported.
 *
 * `process.exit()`, not the bare promise `runScript` usually resolves into: importing `../src/app`
 * pulls in `@opentelemetry/instrumentation`'s ESM patching (`otel-sdk.ts`), which registers a
 * `module.register()` loader hook backed by its own worker thread. That hook is process-lifetime
 * by design — nothing this file or `stopServer()` calls can unregister it — so without a forced
 * exit the event loop never drains and the process hangs forever after logging completion. Safe
 * here specifically: by this point `stopServer()` has already awaited `shutdownAnalytics()` and
 * `shutdownTracing()`, the two steps with async transport writes in flight, so nothing is
 * truncated. Every other `runScript` caller (`scripts/db/`, `scripts/ops/`) never imports `src/app.ts` and so
 * never hits this hook, which is why `run-script.ts` itself stays on `process.exitCode`.
 */
void runScript(seed, () => application?.stopServer() ?? Promise.resolve()).then(() =>
    process.exit(process.exitCode ?? 0)
);
