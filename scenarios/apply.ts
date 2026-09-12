/*
 * Scenario seeder.
 *
 * `scenario:apply` owns DATA; `db:sync` owns SCHEMA. `scenarios/index.ts`'s `SCENARIOS` registry
 * is the table of what to seed; this file is the RUNNER — connection, production gate and the
 * walk over that table, nothing else. The insert-if-absent policy lives in
 * `@scenarios/seed`.
 *
 * Runs on every container boot (see the compose `app` command → `npm run db:bootstrap`), so it
 * must be IDEMPOTENT (fixed `_id`s are inserted only if absent, so a second run is a no-op) and
 * GATED (refuses to touch a production database). Note what idempotent means here:
 * `insertIfAbsent()` SKIPS a factory row whose `_id` already exists, it does not rewrite it —
 * re-running this does NOT repair a row whose stored copy has since drifted from the one below;
 * `npm run scenario:apply:reset` is what does.
 *
 * Passwords are given in PLAIN TEXT: the model's pre-save hook hashes them. Anything hashed by
 * hand here would drift from that hook, and its plaintext would be lost with no way to recover
 * the login.
 *
 * Usage:
 *   npm run scenario:apply [scenario]        # insert the rows; scenario defaults to `shop`
 *   npm run scenario:apply:reset [scenario]  # empty the database first
 */
import 'dotenv/config';
import { start, connection, emptyDatabase } from '@infrastructure/runtime/database';
import { clearCache, stopCache } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from '../db/run-script';
import { SCENARIOS, type ScenarioName } from '@scenarios/index';
import { resolveTranslatables } from '@kernel/registry';
import { setTranslatables } from '@modules/locales/module';
import { hasFallbackSeedPassword } from '@scenarios/accounts';
import { enabledModules } from '../src/modules';

/*
 * `src/app.ts` does both of these the moment it is imported: importing THE registry pulls in
 * every module's `module.ts`, registering its `@infrastructure/i18n` ports — `locales/module.ts`'s
 * translation port, which `products.seed()` now needs. That alone registers the port, not the
 * `translatables` MANIFEST a write validates against; `locales` cannot collect that itself (the
 * same wall the port is built around), so it is built from `enabledModules` and handed in here too
 * — this runner starts no server, so it repeats `app.ts`'s two lines rather than importing it whole.
 */
setTranslatables(resolveTranslatables(enabledModules));

const reset = process.argv.includes('--reset');
/** The one positional argument this CLI takes — everything else is a `--flag`. */
const scenarioArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));

async function seed() {
    /* A boot-time seeder that can drop or overwrite a production database is a footgun. */
    if (process.env.NODE_ENV === 'production') {
        logger.warn('scenario:apply refused to run: NODE_ENV is production.');
        return;
    }

    if (scenarioArgument !== undefined && !Object.hasOwn(SCENARIOS, scenarioArgument)) {
        logger.warn(`scenario:apply refused to run: unknown scenario "${scenarioArgument}".`);
        return;
    }
    // `Object.hasOwn` above narrows against `SCENARIOS`'s keys, not `scenarioArgument`'s own type —
    // the cast states what the guard already proved.
    const scenarioName = (scenarioArgument as ScenarioName | undefined) ?? 'shop';

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

    await start();

    if (reset) {
        await emptyDatabase();
        logger.info('Database emptied.');
    }

    /*
     * `SCENARIOS[scenarioName]()` owns its whole seed — the access model included; see
     * `scenarios/index.ts`'s own docblocks for how `shop` orders its concurrent module writes.
     * This runner names no scenario internals: it only calls whatever the registry maps the name
     * to. `tests/cross-cutting/scenario-fixtures.test.ts` refuses a `shopModules` entry left
     * behind after the module it names is deleted.
     */
    const results = await SCENARIOS[scenarioName]();

    const created = results.filter((result) => result === 'created').length;

    /*
     * This wrote straight to Mongo, so the API's own invalidation never ran and the cache is
     * still holding pre-seed answers (usually empty lists). Drop them — otherwise `GET /products`
     * keeps serving `[]` until the TTL expires. Only worth doing when something actually changed.
     *
     * Fails open, deliberately (§9): seeding must succeed against a stack whose Redis is not up.
     * `reachable` is therefore read but never thrown on — it only decides which line gets
     * logged, so the fail-open is visible in the output instead of silently looking like a
     * cache that happened to be empty.
     */
    if (created > 0) {
        const { deleted, reachable } = await clearCache();
        if (reachable) logger.info(`Cache cleared after seeding: ${deleted} keys removed.`);
        else
            logger.warn(
                'Cache NOT cleared after seeding: Redis is unreachable. Seeding succeeded, but ' +
                    'pre-seed responses will keep being served until their TTL expires.'
            );
    }

    logger.info(
        `Seeding "${scenarioName}" complete: ${created} created, ${results.length - created} already present.`
    );
}

/*
 * Cleanup lives in the runner's `finally`, not at the end of `seed()`: a throw partway through
 * would otherwise skip it and leave the Mongo and Redis sockets open, hanging the process. Both
 * closers are no-ops when their connection was never opened, which covers the production-gate
 * early return above.
 */
void runScript(seed, () => Promise.all([connection.close(), stopCache()]));
