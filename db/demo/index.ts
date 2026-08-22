/*
 * Demo data seeder.
 *
 * `db:seed` owns DATA; `migrate-mongo` owns SCHEMA. Each module owns its own slice of the demo
 * dataset in `src/modules/<name>/demo.ts`; this file is the RUNNER — connection, production gate
 * and the walk over `enabledModules`, nothing else. The upsert policy lives in
 * `@infrastructure/persistence/seed`. What the API then serves is published by
 * `npm run seed:export` as `./demo-data.json`, which is byte-identical with the paired frontend's
 * copy — that file is an OUTPUT of this seeder, never an input to it.
 *
 * It runs on every container boot (see the compose `app` command → `npm run db:bootstrap`), so
 * it must be:
 *
 *   - IDEMPOTENT — fixed `_id`s are upserted, not created, so a second run is a no-op
 *   - GATED — refuses to touch a production database
 *
 * Note what idempotent means here: `upsertById()` SKIPS a fixture whose `_id` already exists, it
 * does not rewrite it. So re-running this does NOT repair a database seeded before the fixtures' image
 * URLs were corrected — `db/migrations/20260806140000-image-url-separators.js` does that.
 *
 * Passwords are given in PLAIN TEXT: the model's pre-save hook hashes them. Anything hashed by
 * hand here would drift from that hook, and its plaintext would be lost (which is exactly what
 * happened to the old `gino@pino.it` fixture).
 *
 * Usage:
 *   npm run db:seed          # upsert the fixtures
 *   npm run db:seed:reset    # drop the database first
 */
import 'dotenv/config';
import { start, connection } from '@infrastructure/runtime/database';
import { clearCache, stopCache } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from '../run-script';
import { enabledModules } from '../../src/modules';

const reset = process.argv.includes('--reset');

async function seed() {
    /* A boot-time seeder that can drop or overwrite a production database is a footgun. */
    if (process.env.NODE_ENV === 'production') {
        logger.warn('db:seed refused to run: NODE_ENV is production.');
        return;
    }

    await start();

    if (reset) {
        await connection.dropDatabase();
        logger.info('Database dropped.');
    }

    /*
     * Every enabled module seeds its own collection. This runner names no domain: a module that
     * declares `seeds` in its manifest gets called, one that does not is skipped, and deleting a
     * module takes its demo data with it without touching this file.
     *
     * Concurrent on purpose, and safe to be: no fixture is derived from another fixture's WRITE.
     * An order embeds a product snapshot built from the catalogue's own fixtures, not read back
     * from Mongo, and a cart references a user id rather than requiring the user row to exist
     * first.
     */
    const perModule = await Promise.all(
        enabledModules.map((appModule) => appModule.seeds?.() ?? Promise.resolve([]))
    );
    const results = perModule.flat();

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
