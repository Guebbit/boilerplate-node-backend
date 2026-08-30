#!/usr/bin/env tsx
/**
 * @module
 * Backfill `thumbnailUrl` for every product and user whose image predates the digest pipeline —
 * `npm run backfill:image-thumbnails`.
 *
 * Every upload that goes through `quarantineUploadedImages` gets a thumbnail as part of the same
 * digest that produced its `imageUrl` — this script exists for the images that never went through
 * that path: rows written before the pipeline shipped, and the committed `public/images/seed/`
 * fixtures the demo dataset points at.
 *
 * Idempotent: the query itself excludes any document that already carries a `thumbnailUrl`, so a
 * second run only touches what the first one missed or failed on.
 *
 * Goes through `productRepository`/`userRepository`, never the raw Mongoose model — `users/index.ts`
 * already states the rule this follows: a model has no caller outside its own module, and a script
 * is not an exception.
 *
 * See: IMAGE_PIPELINE_PLAN.md, docs/tools/image-processing.md
 */
import 'dotenv/config';
import type { QueryFilter } from 'mongoose';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { imageStore } from '@infrastructure/adapters/image-store';
import { thumbnailImage } from '@infrastructure/adapters/image';
import { productRepository } from '../src/modules/products/repository';
import type { ProductDocument } from '../src/modules/products/model';
import { userRepository } from '@modules/users';
import type { UserDocument } from '@modules/users';
import { runScript } from '../db/run-script';

/** Every local, un-thumbnailed image — a remote/default url has no bytes here to thumbnail. */
const UNTHUMBNAILED_LOCAL_IMAGE = {
    imageUrl: { $regex: '^/images/' },
    $or: [{ thumbnailUrl: { $exists: false } }, { thumbnailUrl: '' }]
};

/**
 * Thumbnail one document's image in place, then persist it.
 *
 * @throws Whatever `readImage`, `thumbnailImage` or `putDerivative` throws — the caller decides
 *   whether one row's failure should stop the run.
 */
const backfillOne = async <TDocument extends { imageUrl?: string; thumbnailUrl?: string }>(
    document: TDocument,
    save: (document: TDocument) => Promise<TDocument>
): Promise<void> => {
    if (!document.imageUrl) return;

    const raw = await imageStore.readImage(document.imageUrl);
    const thumbnail = await thumbnailImage(raw);
    const key = document.imageUrl.split('/').pop() ?? document.imageUrl;
    document.thumbnailUrl = await imageStore.putDerivative(key, thumbnail);
    await save(document);
};

/**
 * Sequential, not `Promise.all`: `sharp.concurrency(1)` already caps libvips to one thread per
 * process (see `adapters/image.ts`), so running these in parallel would only add queueing, not
 * throughput — and a script has no request latency to protect. One bad fixture is logged and
 * skipped rather than aborting every other row's backfill.
 *
 * `findAll` answers LEAN rows (its own docblock says so), so each id is re-fetched through
 * `findById` for a hydrated document `.save()` actually exists on — one extra read per row, which
 * a script run rarely is the right place to spend rather than reaching around the repository.
 */
const backfillProducts = async (): Promise<void> => {
    const candidates = await productRepository.findAll(
        UNTHUMBNAILED_LOCAL_IMAGE as QueryFilter<ProductDocument>
    );
    logger.info({ message: 'Backfilling product thumbnails.', count: candidates.length });

    for (const { _id } of candidates) {
        try {
            const product = await productRepository.findById(String(_id));
            if (product) await backfillOne(product, productRepository.save);
        } catch (error) {
            logger.error({
                message: 'Failed to backfill a product thumbnail; left for the next run.',
                id: String(_id),
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
};

const backfillUsers = async (): Promise<void> => {
    const candidates = await userRepository.findAll(
        UNTHUMBNAILED_LOCAL_IMAGE as QueryFilter<UserDocument>
    );
    logger.info({ message: 'Backfilling user thumbnails.', count: candidates.length });

    for (const { _id } of candidates) {
        try {
            const user = await userRepository.findById(String(_id));
            if (user) await backfillOne(user, userRepository.save);
        } catch (error) {
            logger.error({
                message: 'Failed to backfill a user thumbnail; left for the next run.',
                id: String(_id),
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
};

const main = async (): Promise<void> => {
    await start();
    await backfillProducts();
    await backfillUsers();
};

void runScript(main, () => stopDatabase());
