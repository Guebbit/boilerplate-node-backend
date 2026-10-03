#!/usr/bin/env tsx
/**
 * @module
 * Delete a stored image (and its thumbnail) that no current document references — `npm run
 * clean:orphaned-images`. A manual dev-hygiene tool, not a scheduled job.
 *
 * Why it exists: a repeated `npm run demo`/scenario-apply/e2e cycle re-seeds an EPHEMERAL, in-memory
 * Mongo every time, but every upload still lands on the host's persistent `public/images/` —
 * `imageStore.remove()` only runs when a record's OWN update/delete replaces its image, never
 * when the database underneath it is simply thrown away and restarted. Nothing else ever cleans
 * these up, and 280 of them were sitting there at once by 2026-09-28.
 *
 * Reference-based, not age-based, unlike `reap-quarantine.ts`: a quarantine file is inherently
 * transient (a digest job should claim it within seconds), so age alone means abandoned. A
 * PROMOTED image is the opposite — durable, uploaded once, meant to outlive the process — so the
 * only safe test is "does a document still name it", never "is it old". Safe against a real,
 * persistent deployment too (`NODE_TEST_MONGO_URI` pointed at a compose Mongo, or production
 * itself): it only ever deletes a file this run's own database does not reference right now.
 *
 * Generic over which collections carry an image, the same way the digest worker itself is
 * (`kernel/registry.ts#resolveImageTargets`) — a module adding a third `imageTargets` entry needs
 * no change here.
 */
import '@infrastructure/config/dotenv';
import path from 'node:path';
import mongoose from 'mongoose';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { pruneUnreferenced } from '@infrastructure/adapters/filesystem';
import {
    IMAGES_SEGMENT,
    publicRoot,
    thumbnailsDirectory
} from '@infrastructure/adapters/image-store';
import { resolveImageTargets } from '@kernel/registry';
import { enabledModules } from '../../src/modules';
import { runScript } from '../run-script';

/**
 * Every `imageUrl`/`thumbnailUrl` basename a live document currently names, across every
 * `imageTargets`-registered collection — read with the raw driver, never a module's own
 * repository: this script has to reach every collection generically, the same constraint
 * `image.worker.ts` is under (see `resolveImageTargets`'s own docblock).
 *
 * @returns the set of filenames (with extension) still in use — never a full path, since a
 *   promoted url and the file on disk share only their basename
 */
const referencedFilenames = async (): Promise<Set<string>> => {
    const { db: database } = mongoose.connection;
    if (!database) return new Set();

    const collections = Object.keys(resolveImageTargets(enabledModules));
    const rows = await Promise.all(
        collections.map((collection) =>
            database
                .collection(collection)
                .find({}, { projection: { imageUrl: 1, thumbnailUrl: 1 } })
                .toArray()
        )
    );

    const names = new Set<string>();
    for (const row of rows.flat())
        for (const url of [row.imageUrl, row.thumbnailUrl])
            if (typeof url === 'string' && url) names.add(path.basename(url));

    return names;
};

/**
 * Connect, scan both image directories against the live reference set, and report the totals.
 * `images/seed/`, `images/system/` and `images/thumbs/` are left alone unconditionally —
 * {@link pruneUnreferenced} only ever touches a FILE directly under the directory it is given,
 * the same carve-out `.gitignore`'s own `public/images/*` rule makes.
 */
const main = (): Promise<void> =>
    start().then(async () => {
        const root = publicRoot();
        const keep = await referencedFilenames();

        const originals = await pruneUnreferenced(path.join(root, IMAGES_SEGMENT), keep);
        const thumbnails = await pruneUnreferenced(thumbnailsDirectory(root), keep);

        // Stryker disable next-line all
        logger.info({
            message: 'Orphaned images cleaned.',
            originalsChecked: originals.checked,
            originalsReaped: originals.reaped,
            thumbnailsChecked: thumbnails.checked,
            thumbnailsReaped: thumbnails.reaped
        });
    });

void runScript(undefined, main, stopDatabase);
