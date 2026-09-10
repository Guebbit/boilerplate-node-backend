#!/usr/bin/env tsx
/**
 * @module
 * Apply pending data changes, or (`--check`) report them without touching anything —
 * `npm run db:data`. Closes the one gap the rest of this repo's checks did not cover: a deploy
 * that skipped a required backfill used to pass every check silently. Now `--check` fails it.
 *
 * A human runs this — never `db:bootstrap`. An index sync is safely re-appliable on every boot; a
 * data change is a `$unset` or a rename over real rows, and an irreversible write belongs in front
 * of a person, not a container's startup.
 *
 * Usage:
 *   npm run db:data                    # apply every pending file, oldest first
 *   npm run db:data -- --check         # list pending/changed, exit 1 if either is non-empty
 *   npm run db:data -- --force <file>  # re-run one file deliberately, bypassing "already applied"
 *   npm run host -- db:data            # against a containerised database, from the host
 *
 * See: docs/reference/data.md
 */
import 'dotenv/config';
import path from 'node:path';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import { start, connection } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { runScript } from './run-script';
import {
    DATA_DIR,
    currentHost,
    diffMigrations,
    ensureLedgerIndex,
    fileChecksum,
    readLedger,
    recordApplied,
    type DataChangeModule,
    type PendingChange
} from './data-changelog';

/** Report pending/changed without applying anything. */
const checkOnly = process.argv.includes('--check');

/** `--force <file>`: re-run one file deliberately, bypassing the "already applied" check. */
const forceFile = ((): string | undefined => {
    const index = process.argv.indexOf('--force');
    return index === -1 ? undefined : process.argv[index + 1];
})();

/**
 * The native driver handle every `up(database)` receives. `mongoose.connection.db` is typed
 * optional because Mongoose allows reading it before a connection exists; `start()` having
 * resolved is what actually proves it present here.
 *
 * @throws if called before `start()` resolves
 */
const nativeDatabase = (): Db => {
    const { db } = mongoose.connection;
    if (!db)
        throw new Error('Not connected — start() must resolve before nativeDatabase() is called.');
    return db;
};

/** Run one file's `up`, time it, and record it in the same pass — never two files at once. */
const applyOne = async (database: Db, { file, checksum }: PendingChange): Promise<void> => {
    const migration = (await import(path.join(DATA_DIR, file))) as DataChangeModule;
    const startedAt = Date.now();
    await migration.up(database);
    const durationMs = Date.now() - startedAt;

    await recordApplied(database, {
        file,
        checksum,
        durationMs,
        appliedAt: new Date(),
        host: currentHost()
    });
    logger.info(`Applied ${file} (${durationMs}ms).`);
};

/** List pending/changed files as one line, for `--check`'s report and the refusal below. */
const describe = (changes: PendingChange[]): string =>
    changes.map(({ file }) => `  ${file}`).join('\n');

const main = async (): Promise<void> => {
    await start();
    const database = nativeDatabase();
    await ensureLedgerIndex(database);

    if (forceFile !== undefined) {
        await applyOne(database, {
            file: forceFile,
            checksum: fileChecksum(path.join(DATA_DIR, forceFile))
        });
        return;
    }

    const { pending, changed } = diffMigrations(await readLedger(database));

    /*
     * A file that changed since it ran is never re-applied automatically — the ledger's checksum
     * exists precisely to catch this, and applying it silently would run code nobody reviewed
     * against the record that says it already ran.
     */
    if (changed.length > 0)
        throw new Error(
            `${changed.length} applied file(s) changed on disk since they ran:\n${describe(changed)}\n\n` +
                'Use --force <file> if re-running one is deliberate.'
        );

    if (checkOnly) {
        if (pending.length === 0) {
            logger.info('No pending data changes.');
            return;
        }

        logger.info(`${pending.length} pending data change(s):\n${describe(pending)}`);
        // Non-zero on anything pending, so this is usable as a deploy gate.
        process.exitCode = 1;
        return;
    }

    for (const change of pending) await applyOne(database, change);
    if (pending.length === 0) logger.info('No pending data changes.');
};

void runScript(main, () => connection.close());
