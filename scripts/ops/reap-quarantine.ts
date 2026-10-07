#!/usr/bin/env tsx
/**
 * @module
 * Delete quarantined uploads older than the retention window — `npm run reap:quarantine`.
 *
 * Runs:      nightly from `docker/crontab`.
 * Deletes:   a file in `NODE_QUARANTINE_PATH` older than `NODE_QUARANTINE_RETENTION_HOURS`.
 * Why:       a quarantine file outlives its job only when something went wrong (a crash after
 *            `imageStore.quarantine()`, a lost delivery). Every normal run removes its own.
 * Safe:      filesystem-only; nothing but the digest pipeline reads that directory, so nothing
 *            can be relying on a file past the window.
 * Mongo:     connected only afterwards, so `runScript` can record the outcome in `leases`
 *            (`docs/reference/ops.md#scheduled-jobs`).
 *
 * See: docs/tools/image-processing.md
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { reapDirectory } from '@infrastructure/adapters/filesystem';
import { imageConfig } from '@infrastructure/adapters/config';
import { quarantineRoot } from '@infrastructure/adapters/image-store';
import { runScript } from '../run-script';

/** How long a quarantine file is left alone before it counts as abandoned. 24 hours by default —
 * long enough that a broker outage lasting a normal maintenance window does not lose anything. */
const retentionMs = (): number => imageConfig().NODE_QUARANTINE_RETENTION_HOURS * 60 * 60 * 1000;

/**
 * Sweep first, connect after: the sweep itself never touches Mongo, only `runScript`'s outcome
 * record does, so a Mongo outage must not block a cleanup that never needed it.
 */
const main = (): Promise<void> => {
    const root = quarantineRoot();

    return reapDirectory(root, Date.now() - retentionMs(), 'Quarantine')
        .then(({ checked, reaped }) =>
            logger.info({ message: 'Quarantine reaped.', root, checked, reaped })
        )
        .then(() => startJob());
};

// Entry point: run `main`, record the outcome under `reap:quarantine` for `/observability/health`, and close
// the connections on both paths. See `scripts/run-script.ts`.
void runScript('reap:quarantine', main, stopDatabase);
