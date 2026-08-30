#!/usr/bin/env tsx
/**
 * @module
 * Delete quarantined uploads older than the retention window — `npm run reap:quarantine`.
 *
 * A quarantine file outlives its job only when something went wrong: the process crashed after
 * `imageStore.quarantine()` but before the job ran, a payload named an unregistered collection, or
 * a delivery was lost outright. No normal run of the pipeline leaves one behind — every success
 * and every handled failure calls `removeQuarantined` itself (see `image.worker.ts`). This is the
 * backstop for whatever still gets through, meant to run as a periodic job (cron, a scheduled
 * container task) rather than by hand.
 *
 * Filesystem-only and safe to run repeatedly: `NODE_QUARANTINE_PATH` is never served and never
 * read by anything but the digest pipeline, so there is nothing here a concurrent request could
 * be relying on past the retention window.
 *
 * See: IMAGE_PIPELINE_PLAN.md, docs/tools/image-processing.md
 */
import 'dotenv/config';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { runScript } from '../db/run-script';

const quarantineRoot = () => path.resolve(process.env.NODE_QUARANTINE_PATH ?? 'quarantine');

/** How long a quarantine file is left alone before it counts as abandoned. 24 hours by default —
 * long enough that a broker outage lasting a normal maintenance window does not lose anything. */
const retentionMs = (): number =>
    environmentNumber('NODE_QUARANTINE_RETENTION_HOURS', 24, 1) * 60 * 60 * 1000;

const main = async (): Promise<void> => {
    const root = quarantineRoot();
    const cutoff = Date.now() - retentionMs();

    let entries: string[];
    try {
        entries = await readdir(root);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            logger.info({ message: 'Quarantine directory does not exist; nothing to reap.', root });
            return;
        }
        throw error;
    }

    let reaped = 0;
    for (const name of entries) {
        const filePath = path.join(root, name);
        const info = await stat(filePath);
        // Directories are not this store's concern — `quarantine()` writes flat files only.
        if (!info.isFile() || info.mtimeMs > cutoff) continue;
        await unlink(filePath);
        reaped += 1;
    }

    logger.info({ message: 'Quarantine reaped.', root, checked: entries.length, reaped });
};

void runScript(main, () => Promise.resolve());
