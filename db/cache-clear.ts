/*
 * Drop every cached response belonging to this app.
 *
 * The API invalidates its own cache on every write it handles (see `invalidateCache` in
 * `src/middlewares/cache.ts`). Writes that skip the API do not — `db:seed`, `migrate-mongo`,
 * a `mongosh` session — so the old answers keep being served until they expire.
 *
 * `db:seed` calls this automatically. Run it by hand after any manual database surgery.
 *
 * Scoped to `NODE_REDIS_CACHE_PREFIX`, never `FLUSHALL`, so a shared Redis is safe.
 *
 * Usage:
 *   npm run db:cache:clear         # against the compose Redis hostname
 *   npm run host -- db:cache:clear  # against localhost
 */
import 'dotenv/config';
import { clearCache, stopCache } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from './run-script';

void runScript(
    async () => {
        const { deleted, reachable } = await clearCache();

        /*
         * `clearCache` fails open for the seeder's benefit (§9), which for *this* script would
         * mean printing "0 keys removed" and exiting 0 with the cache untouched —
         * indistinguishable from a genuinely empty cache, and precisely the silent failure this
         * script exists to rule out. Clearing the cache is the whole job here, so an unreachable
         * Redis is a failure.
         */
        if (!reachable) {
            throw new Error(
                'Redis is unreachable — the cache was NOT cleared. Stale responses will keep ' +
                    'being served until their TTL expires.'
            );
        }

        logger.info(`Cache cleared: ${deleted} keys removed.`);
    },
    () => stopCache()
);
