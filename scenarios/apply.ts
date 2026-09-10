/*
 * Demo data seeder.
 *
 * `scenario:apply` owns DATA; `db:sync` owns SCHEMA. `scenarios/index.ts` is the table of what to
 * seed; this file is the RUNNER — connection, production gate and the walk over that table,
 * nothing else. The upsert policy lives in `@infrastructure/persistence/seed`. What the API then
 * serves is published by `npm run scenario:build` as `db/demo/demo-data.json` — an OUTPUT of this
 * seeder, never an input to it.
 *
 * Runs on every container boot (see the compose `app` command → `npm run db:bootstrap`), so it
 * must be IDEMPOTENT (fixed `_id`s are upserted, not created, so a second run is a no-op) and
 * GATED (refuses to touch a production database). Note what idempotent means here:
 * `upsertById()` SKIPS a factory row whose `_id` already exists, it does not rewrite it —
 * re-running this does NOT repair a row whose stored copy has since drifted from the one below;
 * `npm run scenario:apply:reset` is what does.
 *
 * Passwords are given in PLAIN TEXT: the model's pre-save hook hashes them. Anything hashed by
 * hand here would drift from that hook, and its plaintext would be lost with no way to recover
 * the login.
 *
 * Usage:
 *   npm run scenario:apply          # upsert the rows
 *   npm run scenario:apply:reset    # drop the database first
 */
import 'dotenv/config';
import { start, connection } from '@infrastructure/runtime/database';
import { clearCache, stopCache } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from '../db/run-script';
import { seedAllDemoModules } from '@scenarios/index';
import { seedAccessModel } from '@kernel/access/seed';
import { resolveTranslatables } from '@kernel/registry';
import { setTranslatables } from '@modules/locales/module';
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

async function seed() {
    /* A boot-time seeder that can drop or overwrite a production database is a footgun. */
    if (process.env.NODE_ENV === 'production') {
        logger.warn('scenario:apply refused to run: NODE_ENV is production.');
        return;
    }

    await start();

    if (reset) {
        await connection.dropDatabase();
        logger.info('Database dropped.');
    }

    /*
     * Every module in `scenarios/index.ts`'s table seeds its own collection. This runner names no
     * domain: it only walks whatever that table lists. `tests/cross-cutting/seed-conformance.test.ts`
     * refuses an entry left behind after the module it names is deleted.
     *
     * Mostly concurrent, and safe to be: no row is derived from another row's WRITE. An order
     * embeds a product snapshot built from the catalogue's own factory, not read back from Mongo,
     * and a cart references a user id rather than requiring the user row to exist first. The one
     * exception — `products` needing `locales`' rows to already exist — is why `seedAllDemoModules`
     * runs `locales` first rather than joining the batch; see its own docblock.
     */
    // The shop, the preset roles and the demo memberships first: a module's rows may be written
    // in any order, but nothing can resolve a caller until there is a shop to be a member of. Not
    // part of the concurrent batch below for that reason.
    await seedAccessModel();

    const results = await seedAllDemoModules();

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
        `Seeding complete: ${created} created, ${results.length - created} already present.`
    );
}

/*
 * Cleanup lives in the runner's `finally`, not at the end of `seed()`: a throw partway through
 * would otherwise skip it and leave the Mongo and Redis sockets open, hanging the process. Both
 * closers are no-ops when their connection was never opened, which covers the production-gate
 * early return above.
 */
void runScript(seed, () => Promise.all([connection.close(), stopCache()]));
