/**
 * @module
 * The scheduled jobs that belong to no module: the upload and mail-spool reapers, the orphaned-
 * image sweep and the outbox backstop. Everything a module owns is declared on its manifest
 * (`AppModule.jobs`).
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { resolveImageTargets } from '@kernel/registry';
import { relayOutbox } from '@kernel/outbox';
import { logger } from '@infrastructure/adapters/logger';
import { reapDirectory } from '@infrastructure/adapters/filesystem';
import { imageConfig, mailFilesConfig } from '@infrastructure/adapters/config';
import { quarantineRoot } from '@infrastructure/adapters/image-store';
import { reapSpooled } from '@infrastructure/adapters/mail-spool';
import { reapOrphanedImages } from '@infrastructure/adapters/orphaned-images';
import { enabledModules } from '../modules';

/** One hour, in milliseconds. */
const HOUR_MS = 60 * 60 * 1000;

/**
 * How long a quarantine file is left alone before it counts as abandoned. 24 hours by default —
 * long enough that a broker outage lasting a normal maintenance window does not lose anything.
 */
const quarantineRetentionMs = (): number => imageConfig().NODE_QUARANTINE_RETENTION_HOURS * HOUR_MS;

/**
 * How long a spooled file is left alone before it counts as abandoned. One hour by default — a
 * mail job settles in seconds; anything still here past that is a job that died mid-flight.
 */
const mailSpoolRetentionMs = (): number =>
    mailFilesConfig().NODE_MAIL_SPOOL_RETENTION_HOURS * HOUR_MS;

/** The jobs no module owns. */
export const appJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:quarantine',
        schedule: '0 2 * * *',
        summary: 'Deletes quarantined upload files past their retention window.',
        run: () => {
            const root = quarantineRoot();
            return reapDirectory(root, Date.now() - quarantineRetentionMs(), 'Quarantine').then(
                ({ checked, reaped }) => {
                    logger.info({ message: 'Quarantine reaped.', root, checked, reaped });
                }
            );
        },
        // The sweep itself never touches Mongo, only the outcome record does.
        connectFirst: false
    },
    {
        name: 'reap:orphaned-images',
        schedule: '3 2 * * *',
        summary:
            'Deletes a stored image or thumbnail no document names, once it is over an hour old.',
        run: () => reapOrphanedImages(Object.keys(resolveImageTargets(enabledModules)))
    },
    {
        name: 'reap:mail-spool',
        schedule: '30 2 * * *',
        summary:
            'Deletes a spooled email attachment older than its retention window — a mail job died mid-flight.',
        run: () =>
            reapSpooled(mailSpoolRetentionMs()).then((reaped) => {
                if (reaped > 0)
                    logger.info({ message: 'Spooled mail attachments reaped.', reaped });
            }),
        connectFirst: false
    },
    {
        name: 'sweep:outbox',
        // Every minute: the outbox's backstop relay. The writer already nudges one after commit, so
        // this only carries what a crash or a retry backoff left behind.
        schedule: '* * * * *',
        summary:
            "Publishes every due outbox event — the backstop for the writer's own after-commit nudge.",
        run: () =>
            relayOutbox().then((result) => {
                logger.info({ message: 'outbox: sweep finished', ...result });
            }),
        // Publishing an event is calling its subscribers, and `relayOutbox` refuses to run in a
        // process where none are registered.
        needs: { subscriptions: true }
    }
];
