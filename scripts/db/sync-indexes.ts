/*
 * Make the database's indexes match the schemas — `npm run db:sync`.
 *
 * The replacement for a migration tool's schema half. Indexes are declared on each module's
 * `model.ts` and nowhere else; this reconciles the database with them. Idempotent, so it runs on
 * every boot and every deploy rather than once per database.
 *
 * It ADDS what a schema declares and never drops by surprise: an index no schema declares is kept
 * and reported, so an older release run after a rollback cannot delete the newer one's indexes.
 * Two things are dropped without asking: an index whose options changed (replaced) and a name a
 * model listed as retired. `--prune` also drops every other undeclared index; `--check` first.
 *
 * Usage:
 *   npm run db:sync              # apply (add-only)
 *   npm run db:sync -- --check   # print the plan, change nothing, exit 1 if it would change
 *   npm run db:sync -- --prune   # also drop every undeclared index (dev; a deploy never does)
 *   npm run host -- db:sync      # against a containerised database, from the host
 *
 * See: docs/reference/data.md
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import mongoose from 'mongoose';
import { startJob, connection } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from '../run-script';
import { applyIndexSync, hasChanges, planIndexSync, type IndexDiff } from './index-sync';
import { hasFlag } from '../cli';

/** Report the plan without touching the database. */
const checkOnly = hasFlag('check');

/** Also drop every index no schema declares. A deploy never passes it. */
const prune = hasFlag('prune');

/** One collection's pending changes, as a line per index rather than a blob. */
const describe = ({
    collection,
    toCreate,
    toReplace,
    toDropRetired,
    toDropUndeclared,
    kept
}: IndexDiff): string =>
    [
        `  ${collection}`,
        ...toCreate.map((key) => `    + create ${JSON.stringify(key)}`),
        ...toReplace.map(({ name, key }) => `    ~ replace ${name} ${JSON.stringify(key)}`),
        ...toDropRetired.map((name) => `    - drop retired ${name}`),
        ...toDropUndeclared.map((name) => `    - drop undeclared ${name}`),
        ...kept.map((name) => `    = undeclared, kept: ${name} (run with --prune to drop)`)
    ].join('\n');

/** Print a plan under a heading, or say there was nothing to do. */
const report = (plan: IndexDiff[], heading: string): void => {
    if (plan.length === 0) {
        logger.info('Indexes already match the schemas — nothing to do.');
        return;
    }

    logger.info(`${heading}\n${plan.map((diff) => describe(diff)).join('\n')}`);
};

/** Connect, then either report the plan or apply it. */
const sync = async (): Promise<void> => {
    /*
     * Mongoose builds every declared index on connect when `autoIndex` is on, which it is
     * everywhere else — that is what gives the app and the test suite their constraints for free.
     * Here it is wrong twice over: it would make `--check` WRITE to the database it was asked only
     * to inspect, and on the apply path it would race the reconciliation below.
     * https://mongoosejs.com/docs/guide.html#autoIndex
     */
    mongoose.set('autoIndex', false);

    await startJob();

    if (checkOnly) {
        const plan = await planIndexSync({ prune });
        report(plan, `${plan.length} collection(s) differ from their schemas:`);

        /*
         * Non-zero when applying would change something, so this is usable as a deploy gate. An
         * undeclared index that would be kept is reported but is not a change. `runScript` owns
         * the exit code on the failure path, and a plan is not a failure — set it directly rather
         * than throwing, which would print a stack for an outcome that is merely informative.
         */
        if (plan.some((diff) => hasChanges(diff))) process.exitCode = 1;
        return;
    }

    report(await applyIndexSync({ prune }), 'Indexes synced:');
};

// `undefined`: a deploy-time setup script, not a `docker/crontab` job — no expected interval to
// alert on, so it takes no part in the job-health/metric tracking (`docs/reference/ops.md`).
void runScript(undefined, sync, () => connection.close());
