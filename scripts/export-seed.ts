#!/usr/bin/env tsx
/**
 * Publish the demo dataset as the API actually serves it — `npm run seed:export`.
 *
 * ## What this replaces, and why
 *
 * The two repos used to SHARE SOURCE. `db/seeds/seed-identities.ts` was a dependency-free file of
 * plain facts — ids, emails, prices — assembled from a fragment in every module and copied verbatim
 * into the frontend, where a hash check proved the copies had not forked. Each side then wrote its
 * own mapper from those facts into the shape it needed.
 *
 * Sharing the facts left the MAPPERS unchecked, and that is where the drift actually lived. The
 * frontend's mock carried a hand-written `active: true` and `verified: true` because someone had
 * read the backend's schema once and copied the defaults across; it carried no `locale` at all,
 * because nobody remembered the column existed. Every spec on both sides stayed green, since each
 * was consistent with its own copy.
 *
 * So this publishes the OUTPUT instead of the input. It seeds a throwaway database with the real
 * seeders, hands it to `db/demo/assemble.ts`, and writes what that returns. Schema defaults,
 * derived totals and serializer omissions are all in the file because the API produced them, not
 * because a fixture claimed them.
 *
 * ## Why a real database rather than calling the serializers directly
 *
 * The transforms are only half of what shapes a response. `default:` values are applied by Mongoose
 * on write, the password hash is applied by a pre-save hook, and `select: false` decides what a read
 * can even see. Running the fixtures through a `mongod` is what makes the published rows the rows
 * the API would serve — anything short of it re-introduces a mapper, which is the thing being
 * removed.
 *
 * ## What this file owns, and what it does not
 *
 * Only the throwaway server, the seeding, and the read/compare/write around the artefact. The walk
 * that turns a database into those bytes is `db/demo/assemble.ts`, because
 * `tests/unit/db/migration-demo-data.test.ts` re-derives the same dataset from a MIGRATED database
 * and compares it to this one. Two implementations of that walk could disagree about what the
 * dataset is, which is the drift this whole design removes.
 *
 * Usage:
 *   npm run seed:export            # write db/demo/demo-data.json
 *   npm run check:seed-export      # fail if the committed file is stale, write nothing
 */

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { assembleDemoDataset, DEMO_DATA_PATH } from '../db/demo/assemble';
import { enabledModules } from '../src/modules';

const checkOnly = process.argv.includes('--check');

/* Same pre-installed binary the test suite uses (`npm run setup:mongod`), same fallback: absent,
 * mongodb-memory-server downloads one on first run. */
const systemBinary = process.env.MONGOMS_SYSTEM_BINARY ?? '/tmp/mongod';
if (existsSync(systemBinary)) {
    process.env.MONGOMS_SYSTEM_BINARY = systemBinary;
    process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
    process.env.MONGOMS_MD5_CHECK = 'false';
}

const run = async (): Promise<number> => {
    const server = await MongoMemoryServer.create();
    /* `getDatabaseUri()` reads this first, so the app's own connect path is the one used here. */
    process.env.NODE_DB_URI = server.getUri();

    try {
        await mongoose.connect(process.env.NODE_DB_URI);
        await Promise.all(
            enabledModules.map((appModule) => appModule.seeds?.() ?? Promise.resolve([]))
        );

        const assembled = await assembleDemoDataset();
        const committed = existsSync(DEMO_DATA_PATH) ? readFileSync(DEMO_DATA_PATH, 'utf8') : '';

        if (assembled === committed) {
            console.info('[seed-export] db/demo/demo-data.json is up to date.');
            return 0;
        }

        if (checkOnly) {
            console.error(
                `[seed-export] STALE — db/demo/demo-data.json does not match what the seeders produce.\n` +
                    `  A fixture changed without the dataset being re-exported, or the file was hand-edited.\n` +
                    `  Fix with: npm run seed:export\n` +
                    `  Then copy the result to the paired frontend — check:spec-identity compares them.`
            );
            return 1;
        }

        writeFileSync(DEMO_DATA_PATH, assembled);
        console.info('[seed-export] wrote db/demo/demo-data.json.');
        return 0;
    } finally {
        /* Both are no-ops if the step above never got that far, which covers an early throw. */
        await mongoose.disconnect();
        await server.stop();
    }
};

run().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
);
