#!/usr/bin/env tsx
/**
 * @module
 * Sweeps the mail SPOOL — `npm run reap:mail-spool`. A spooled file outlives its job only when
 * something went wrong: the mail job died between `spoolAttachment()` and the send, or was lost
 * outright. This is the backstop for whatever still gets through, meant to run as a periodic job
 * (cron, a scheduled container task) rather than by hand.
 *
 * Filesystem-only and safe to run repeatedly: `NODE_MAIL_SPOOL_PATH` is never served and never
 * read by anything but `mailer.ts`, so there is nothing here a concurrent send could be relying
 * on past the retention window.
 *
 * See: docs/tools/email-and-rendering.md
 */
import 'dotenv/config';
import { logger } from '@infrastructure/adapters/logger';
import { reapSpooled } from '@infrastructure/adapters/mail-spool';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { runScript } from '../db/run-script';

/** How long a spooled file is left alone before it counts as abandoned. One hour by default — a
 * mail job settles in seconds; anything still here past that is a job that died mid-flight. */
const retentionMs = (): number =>
    environmentNumber('NODE_MAIL_SPOOL_RETENTION_HOURS', 1, 1) * 60 * 60 * 1000;

/** Run the sweep and log how many files it reaped. */
const main = (): Promise<void> =>
    reapSpooled(retentionMs()).then((reaped) => {
        if (reaped > 0) logger.info({ message: 'Spooled mail attachments reaped.', reaped });
    });

void runScript(main, () => Promise.resolve());
