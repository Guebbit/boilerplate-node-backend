/**
 * @module
 * The scheduled jobs that belong to no module: the upload and mail-spool reapers, the orphaned-
 * image sweep and the outbox backstop. Everything a module owns is declared on its manifest
 * (`AppModule.jobs`).
 *
 * @see docs/reference/ops.md#scheduled-jobs
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
import { appJobData } from './jobs.generated';
import { HOUR_MS } from '@domain-primitives/time';

/** The jobs no module owns. */
export const appJobs: readonly JobDeclaration[] = [
    {
        ...appJobData.reapQuarantine,
        run: () => {
            const root = quarantineRoot();
            /**
             * A quarantine file is left alone this long before it counts as abandoned: 24 hours by
             * default, so a broker outage across a normal maintenance window loses nothing.
             */
            const retentionMs = imageConfig().NODE_QUARANTINE_RETENTION_HOURS * HOUR_MS;
            return reapDirectory(root, Date.now() - retentionMs, 'Quarantine').then(
                ({ checked, reaped }) => {
                    logger.info({ message: 'Quarantine reaped.', root, checked, reaped });
                }
            );
        },
        // The sweep itself never touches Mongo, only the outcome record does.
        connectFirst: false
    },
    {
        ...appJobData.reapOrphanedImages,
        run: () => reapOrphanedImages(Object.keys(resolveImageTargets(enabledModules)))
    },
    {
        ...appJobData.reapMailSpool,
        /**
         * A spooled file is left alone this long before it counts as abandoned: one hour by default.
         * A mail job settles in seconds; anything still here past that died mid-flight.
         */
        run: () =>
            reapSpooled(mailFilesConfig().NODE_MAIL_SPOOL_RETENTION_HOURS * HOUR_MS).then(
                (reaped) => {
                    if (reaped > 0)
                        logger.info({ message: 'Spooled mail attachments reaped.', reaped });
                }
            ),
        connectFirst: false
    },
    {
        ...appJobData.sweepOutbox,
        run: () =>
            relayOutbox().then((result) => {
                logger.info({ message: 'outbox: sweep finished', ...result });
            })
    }
];
