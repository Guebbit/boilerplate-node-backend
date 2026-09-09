#!/usr/bin/env tsx
/**
 * Publish the demo dataset as the API actually serves it — `npm run seed:export`.
 *
 * It seeds a throwaway database with the real seeders, hands it to `./assemble.ts`, and
 * writes what that returns. Schema defaults, derived totals and serializer omissions are in the
 * file because the API produced them, not because a fixture claimed them.
 *
 * That is the whole point: publishing the INPUT instead leaves the two repos' mappers unchecked,
 * which is where the drift actually lived — a hand-written `active: true` in the frontend's mock,
 * and no `locale` at all, with every spec on both sides green against its own copy.
 *
 * See: docs/api/contract-fragmentation.md#the-demo-dataset-—-not-a-bundle-at-all-any-more
 */

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { assembleDemoDataset, DEMO_DATA_PATH } from './assemble';
import { seedAllDemoModules } from '@demo/index';
import { seedAccessModel } from '@kernel/access/seed';
import { resolveTranslatables } from '@kernel/registry';
import { setTranslatables } from '@modules/locales/module';
import { enabledModules } from '../../src/modules';

/* `src/app.ts`'s own two lines, repeated here — see `db/demo/index.ts`'s identical call for why:
 * importing THE registry registers every module's `@infrastructure/i18n` ports (the translation
 * port `products.seed()` needs), and `translatables` still needs building from `enabledModules`
 * and handing in, since `locales` cannot collect its own manifest across the module wall. */
setTranslatables(resolveTranslatables(enabledModules));

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
        // Same order as the two runtime runners: the shop and its roles before any module's
        // fixtures, because nothing can resolve a caller until there is a shop to be a member of.
        // `seedAllDemoModules` then runs `locales` before the rest — see its own docblock for why.
        await seedAccessModel();
        await seedAllDemoModules();

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
                    `  Fix with: npm run seed:export`
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
