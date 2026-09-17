/*
 * Make the database's indexes match the schemas — `npm run db:sync`.
 *
 * The replacement for a migration tool's schema half. Indexes are declared on each module's
 * `model.ts` and nowhere else; this reconciles the database with them. Idempotent, so it runs on
 * every boot and every deploy rather than once per database.
 *
 * It DROPS indexes no schema declares. That is the point — an index nobody declares is drift —
 * but it is also why `--check` exists: run that first against anything you cannot rebuild.
 *
 * Usage:
 *   npm run db:sync              # apply
 *   npm run db:sync -- --check   # print the plan, change nothing, exit 1 if it is not empty
 *   npm run host -- db:sync      # against a containerised database, from the host
 *
 * See: docs/reference/data.md
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { start, connection } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from './run-script';
import { applyIndexSync, planIndexSync, type IndexDiff } from './index-sync';

/** Report the plan without touching the database. */
const checkOnly = process.argv.includes('--check');

/** One collection's pending changes, as a line per index rather than a blob. */
const describe = ({ collection, toCreate, toDrop }: IndexDiff): string =>
    [
        `  ${collection}`,
        ...toCreate.map((key) => `    + ${JSON.stringify(key)}`),
        ...toDrop.map((name) => `    - ${name}`)
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

    await start();

    if (checkOnly) {
        const plan = await planIndexSync();
        report(plan, `${plan.length} collection(s) differ from their schemas:`);

        /*
         * Non-zero on drift, so this is usable as a deploy gate. `runScript` owns the exit code on
         * the failure path, and a plan is not a failure — set it directly rather than throwing,
         * which would print a stack for an outcome that is merely informative.
         */
        if (plan.length > 0) process.exitCode = 1;
        return;
    }

    report(await applyIndexSync(), 'Indexes synced:');
};

void runScript(sync, () => connection.close());
