#!/usr/bin/env tsx
/**
 * @module
 * Delete spooled email attachments older than the retention window — `npm run reap:mail-spool`.
 *
 * A spooled file outlives its job only when something went wrong: the mail job died between
 * `spoolAttachment()` and the send, or was lost outright. No normal run loses one — `nodemailer()`
 * discards every key it spooled in its own `.finally`, success or failure. This is the backstop
 * for whatever still gets through, meant to run as a periodic job (cron, a scheduled container
 * task) rather than by hand.
 *
 * Filesystem-only and safe to run repeatedly: `NODE_MAIL_SPOOL_PATH` is never served and never
 * read by anything but `mailer.ts`, so there is nothing here a concurrent send could be relying
 * on past the retention window.
 *
 * See: docs/tools/email-and-rendering.md
 */
import 'dotenv/config';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { runScript } from '../db/run-script';

const spoolRoot = () => path.resolve(process.env.NODE_MAIL_SPOOL_PATH ?? 'storage/mail-spool');

/** How long a spooled file is left alone before it counts as abandoned. One hour by default — a
 * mail job settles in seconds; anything still here past that is a job that died mid-flight. */
const retentionMs = (): number =>
    environmentNumber('NODE_MAIL_SPOOL_RETENTION_HOURS', 1, 1) * 60 * 60 * 1000;

const main = async (): Promise<void> => {
    const root = spoolRoot();
    const cutoff = Date.now() - retentionMs();

    let entries: string[];
    try {
        entries = await readdir(root);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            logger.info({ message: 'Mail spool directory does not exist; nothing to reap.', root });
            return;
        }
        throw error;
    }

    let reaped = 0;
    for (const name of entries) {
        const filePath = path.join(root, name);
        const info = await stat(filePath);
        // Directories are not this store's concern — `spoolAttachment()` writes flat files only.
        if (!info.isFile() || info.mtimeMs > cutoff) continue;
        await unlink(filePath);
        reaped += 1;
    }

    logger.info({ message: 'Mail spool reaped.', root, checked: entries.length, reaped });
};

void runScript(main, () => Promise.resolve());
