#!/usr/bin/env tsx
/**
 * Build the demo dataset as the API actually serves it — `npm run scenario:build`.
 *
 * It seeds a throwaway database with the real seeders, hands it to `./assemble.ts`, and
 * writes what that returns. Schema defaults, derived totals and serializer omissions are in the
 * file because the API produced them, not because a factory claimed them.
 *
 * Output:  `scenarios/dataset.json` — gitignored, rebuilt by `postinstall`.
 * Read by: `scripts/contracts/client-collections-bundle.ts`, for realistic request examples.
 * Read by: nothing at runtime, and no copy reaches the paired frontend.
 *
 * See: docs/api/contract-fragmentation.md#the-demo-dataset-—-not-a-bundle-at-all-any-more
 */

import 'dotenv/config';
import { existsSync, writeFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { assembleDemoDataset, DATASET_PATH } from './assemble';
import { seedAllDemoModules } from '@scenarios/index';
import { seedAccessModel } from '@kernel/access/seed';
import { resolveTranslatables } from '@kernel/registry';
import { setTranslatables } from '@modules/locales/module';
import { enabledModules } from '../../src/modules';

/* `src/app.ts`'s own two lines, repeated here — see `scenarios/apply.ts`'s identical call for why:
 * importing THE registry registers every module's `@infrastructure/i18n` ports (the translation
 * port `products.seed()` needs), and `translatables` still needs building from `enabledModules`
 * and handing in, since `locales` cannot collect its own manifest across the module wall. */
setTranslatables(resolveTranslatables(enabledModules));

/* Same pre-installed binary the test suite uses (`npm run setup:mongod`), same fallback: absent,
 * mongodb-memory-server downloads one on first run. */
const systemBinary = process.env.MONGOMS_SYSTEM_BINARY ?? '/tmp/mongod';
if (existsSync(systemBinary)) {
    process.env.MONGOMS_SYSTEM_BINARY = systemBinary;
    process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
    process.env.MONGOMS_MD5_CHECK = 'false';
}

const run = async (): Promise<void> => {
    const server = await MongoMemoryServer.create();
    /* `getDatabaseUri()` reads this first, so the app's own connect path is the one used here. */
    process.env.NODE_DB_URI = server.getUri();

    try {
        await mongoose.connect(process.env.NODE_DB_URI);
        // Same order as the two runtime runners: the shop and its roles before any module's
        // rows, because nothing can resolve a caller until there is a shop to be a member of.
        // `seedAllDemoModules` then runs `locales` before the rest — see its own docblock for why.
        await seedAccessModel();
        await seedAllDemoModules();

        writeFileSync(DATASET_PATH, await assembleDemoDataset());
        console.info('[scenario-build] wrote scenarios/dataset.json.');
    } finally {
        /* Both are no-ops if the step above never got that far, which covers an early throw. */
        await mongoose.disconnect();
        await server.stop();
    }
};

run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
