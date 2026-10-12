#!/usr/bin/env tsx
/**
 * @module
 * Wipe the hold note on stale fulfillment orders — `npm run reap:delivery`.
 *
 * A fulfillment order is the record of what was promised and what left, and is never deleted. What
 * it holds that nobody can bound is the free text staff typed about a hold (`holdNote`: "customer
 * rang twice, sounded drunk"). Once a fulfillment order has not changed for
 * `NODE_HOLD_NOTE_RETENTION_DAYS` (default 365), the note is unset. Lines, status and dates survive.
 *
 * Clock:   `updatedAt`, not a closing date. A fulfillment order held forever never closes.
 * Repeat:  safe. The filter only matches one still holding a note; the wipe does not move `updatedAt`.
 *
 * Meant to run periodically (the same cron container as the other `reap:*` scripts), never on
 * every boot.
 *
 * Removal: owned by `delivery` — deletes with the module, along with the `reap:delivery` npm script
 * and its `docker/crontab` line.
 *
 * See: docs/theory/data-retention.md#free-text-on-holds, docs/reference/ops.md
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { scrubHoldNotes } from '@modules/delivery';
import { runScript } from '../run-script';

/** Connect, wipe the note of every fulfillment order past its retention window, and resolve nothing. */
const main = (): Promise<void> => startJob().then(() => scrubHoldNotes().then(() => undefined));

// Entry point: run `main`, record the outcome under `reap:delivery` for `/observability/health`, and
// close the connections on both paths. See `scripts/run-script.ts`.
void runScript('reap:delivery', main, stopDatabase);
