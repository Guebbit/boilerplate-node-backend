#!/usr/bin/env tsx
/**
 * @module
 * Wipe the free text on stale returns — `npm run reap:returns`.
 *
 * A return is a legal record and is never deleted. What it holds that nobody can bound is the
 * text a person typed (`note`) and the text staff wrote about them (`declineReason`). Once a
 * return has not changed for `NODE_RETURN_TEXT_RETENTION_DAYS` (default 1095), both are unset.
 * Status, lines, amounts and dates survive.
 *
 * Clock:   `updatedAt`, not the closing date. An approved return whose goods never arrive never closes.
 * Repeat:  safe. The filter only matches a return still holding text; the wipe does not move `updatedAt`.
 * Why not driven by the order scrub: that clock starts only at account erasure, so it never reaches a live customer.
 *
 * Meant to run periodically (the same cron container as the other `reap:*` scripts), never on
 * every boot.
 *
 * Removal: owned by `returns` — deletes with the module, along with the `reap:returns` npm script
 * and its `docker/crontab` line.
 *
 * See: docs/theory/data-retention.md#free-text-on-returns, docs/reference/ops.md
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { returnService } from '@modules/returns';
import { runScript } from '../run-script';

/** Connect, wipe the text of every return past its retention window, and resolve nothing. */
const main = (): Promise<void> =>
    startJob()
        .then(() => returnService.scrubReturnText())
        .then(() => undefined);

// Entry point: run `main`, record the outcome under `reap:returns` for `/observability/health`, and close
// the connections on both paths. See `scripts/run-script.ts`.
void runScript('reap:returns', main, stopDatabase);
