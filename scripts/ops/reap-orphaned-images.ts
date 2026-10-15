#!/usr/bin/env tsx
/**
 * @module
 * Delete a stored image (and its thumbnail) that no current document references —
 * `npm run reap:orphaned-images`.
 *
 * Runs:        nightly from `docker/crontab`; by hand after a demo or e2e cycle.
 * The work:    `reapOrphanedImages` — what it deletes, what it spares and why.
 * Collections: every `imageTargets` entry (`kernel/registry.ts#resolveImageTargets`), so a new
 *              module with an image needs no change here.
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { reapOrphanedImages } from '@infrastructure/adapters/orphaned-images';
import { resolveImageTargets } from '@kernel/registry';
import { enabledModules } from '../../src/modules';
import { runScript } from '../run-script';

/** Connect, then sweep every collection a module registered an image target for. */
const main = (): Promise<void> =>
    startJob()
        .then(() => reapOrphanedImages(Object.keys(resolveImageTargets(enabledModules))))
        .then(() => undefined);

// Entry point: run `main`, record the outcome under `reap:orphaned-images` for `/observability/health`,
// and close the database on both paths. See `scripts/run-script.ts`.
void runScript('reap:orphaned-images', main, stopDatabase);
