/*
 * Demo data seeder.
 *
 * `db:seed` owns DATA; `migrate-mongo` owns SCHEMA. `./fixtures` is the single source of the demo
 * dataset; this file is the RUNNER — connection, upsert policy and production gate, nothing else.
 * The data lives next door precisely so it can be read without any of that happening.
 *
 * It runs on every container boot (see the compose `app` command → `npm run db:bootstrap`), so
 * it must be:
 *
 *   - IDEMPOTENT — fixed `_id`s are upserted, not created, so a second run is a no-op
 *   - GATED — refuses to touch a production database
 *
 * Note what idempotent means here: `upsert()` SKIPS a fixture whose `_id` already exists, it does
 * not rewrite it. So re-running this does NOT repair a database seeded before the fixtures' image
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
import { Types } from 'mongoose';
import { start, connection } from '@core/bootstrap/database';
import { userRepository } from '@repositories/users';
import { productRepository } from '@repositories/products';
import { orderRepository } from '@repositories/orders';
import type { IOrderDocument } from '@models/orders';
import { clearCache, stopCache } from '@core/adapters/cache';
import { logger } from '@core/adapters/logger';
import { runScript } from '../run-script';
import { users, products, orders } from './fixtures';

const reset = process.argv.includes('--reset');

/*
 * Upsert one fixture by its fixed `_id`.
 *
 * Documents go through `save()` rather than `updateOne(..., { upsert: true })` so the model's
 * pre-save hooks still run — most importantly the bcrypt password hash, which a raw driver
 * write would skip (that is precisely how the old migration's password drifted).
 */
const upsert = async (
    repository: {
        findById: (id: string) => PromiseLike<unknown>;
        create: (data: never) => Promise<unknown>;
    },
    fixture: { _id: Types.ObjectId }
): Promise<'created' | 'skipped'> => {
    const existing = await repository.findById(fixture._id.toString());
    if (existing) return 'skipped';
    await repository.create(fixture as never);
    return 'created';
};

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

    const results = await Promise.all([
        ...users.map((user) => upsert(userRepository, user)),
        ...products.map((product) => upsert(productRepository, product)),
        ...orders.map((order) =>
            upsert(orderRepository, order as Partial<IOrderDocument> & { _id: Types.ObjectId })
        )
    ]);

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
