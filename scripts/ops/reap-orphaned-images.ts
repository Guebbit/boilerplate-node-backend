#!/usr/bin/env tsx
/**
 * @module
 * Delete a stored image (and its thumbnail) that no current document references —
 * `npm run reap:orphaned-images`.
 *
 * Runs:        nightly from `docker/crontab`; by hand after a demo or e2e cycle.
 * Deletes:     a file under `public/images/` and `thumbs/` that no document names.
 * Spares:      anything younger than one hour. An upload is promoted a moment before its row is
 *              saved, and a sweep must not take it from under that write.
 * Why by name: a promoted image is durable, so age says nothing about whether it is wanted
 *              (unlike `reap-quarantine.ts`). Only "does a document still name it" can.
 * Collections: every `imageTargets` entry (`kernel/registry.ts#resolveImageTargets`), so a new
 *              module with an image needs no change here.
 *
 * Orphans come from two places:
 *   - a refused upload that never reached its close hook (a dropped connection)
 *   - a throwaway Mongo (`npm run demo`, e2e) that was reseeded under files on a persistent disk
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import path from 'node:path';
import mongoose from 'mongoose';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
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

/** A file younger than this is never swept: it may be promoted but not yet saved on its row. */
const MIN_AGE_MS = 60 * 60 * 1000;

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
    startJob().then(async () => {
        const root = publicRoot();
        const keep = await referencedFilenames();

        const originals = await pruneUnreferenced(
            path.join(root, IMAGES_SEGMENT),
            keep,
            MIN_AGE_MS
        );
        const thumbnails = await pruneUnreferenced(thumbnailsDirectory(root), keep, MIN_AGE_MS);

        // Stryker disable next-line all
        logger.info({
            message: 'Orphaned images cleaned.',
            originalsChecked: originals.checked,
            originalsReaped: originals.reaped,
            thumbnailsChecked: thumbnails.checked,
            thumbnailsReaped: thumbnails.reaped
        });
    });

// Entry point: run `main`, record the outcome under `reap:orphaned-images` for `/observability/health`,
// and close the database on both paths. See `scripts/run-script.ts`.
void runScript('reap:orphaned-images', main, stopDatabase);
