/**
 * @module
 * Sweep stored images that no current document names. The nightly `reap:orphaned-images` job's
 * work, kept here so it is a tested function and not a property of a cron script.
 *
 * Orphans come from two places:
 * - a refused upload that never reached its close hook (a dropped connection)
 * - a throwaway Mongo (`npm run demo`, e2e) that was reseeded under files on a persistent disk
 *
 * See: docs/reference/ops.md
 */

import path from 'node:path';
import mongoose from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { pruneUnreferenced } from '@infrastructure/adapters/filesystem';
import {
    IMAGES_SEGMENT,
    publicRoot,
    thumbnailsDirectory
} from '@infrastructure/adapters/image-store';

/** A file younger than this is never swept: it may be promoted but not yet saved on its row. */
const MIN_AGE_MS = 60 * 60 * 1000;

/**
 * Every `imageUrl`/`thumbnailUrl` basename a live document currently names, across the given
 * collections — read with the raw driver, never a module's own repository: the sweep has to reach
 * every collection generically, the same constraint `image.worker.ts` is under.
 *
 * @param collections - every collection that holds an image reference
 * @returns the set of filenames (with extension) still in use — never a full path, since a
 *   promoted url and the file on disk share only their basename
 */
const referencedFilenames = async (collections: readonly string[]): Promise<Set<string>> => {
    const { db: database } = mongoose.connection;
    if (!database) return new Set();

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

/** What one sweep looked at and removed. */
export interface OrphanSweep {
    originalsChecked: number;
    originalsReaped: number;
    thumbnailsChecked: number;
    thumbnailsReaped: number;
}

/**
 * Scan both image directories against the live reference set and delete what nothing names.
 * `images/seed/`, `images/system/` and `images/thumbs/` are left alone unconditionally —
 * `pruneUnreferenced` only ever touches a FILE directly under the directory it is given, the same
 * carve-out `.gitignore`'s own `public/images/*` rule makes. Anything younger than an hour is
 * spared: an upload is promoted a moment before its row is saved. "Does a document still name it"
 * is the only test, because a promoted image is durable and age says nothing about whether it is
 * wanted.
 *
 * @param collections - every collection that can hold an image reference
 *   (`resolveImageTargets`'s keys), so a new module with an image needs no change here
 * @returns how many files each directory held and how many it removed
 */
export const reapOrphanedImages = async (collections: readonly string[]): Promise<OrphanSweep> => {
    const root = publicRoot();
    const keep = await referencedFilenames(collections);

    const originals = await pruneUnreferenced(path.join(root, IMAGES_SEGMENT), keep, MIN_AGE_MS);
    const thumbnails = await pruneUnreferenced(thumbnailsDirectory(root), keep, MIN_AGE_MS);

    const sweep = {
        originalsChecked: originals.checked,
        originalsReaped: originals.reaped,
        thumbnailsChecked: thumbnails.checked,
        thumbnailsReaped: thumbnails.reaped
    };
    // Stryker disable next-line all
    logger.info({ message: 'Orphaned images cleaned.', ...sweep });
    return sweep;
};
