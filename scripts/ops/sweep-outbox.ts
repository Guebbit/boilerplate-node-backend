#!/usr/bin/env tsx
/**
 * @module
 * Publish every transactional-outbox event that is due — `npm run sweep:outbox`.
 *
 * The writer nudges a relay right after its transaction commits, so this is the backstop, not the
 * fast path: it publishes what a crashed or unreachable process left behind, and what failed and
 * has now waited out its backoff. `relayOutbox` claims each row with a lease, so a pass
 * overlapping the nudge or its own previous run publishes nothing twice.
 *
 * Meant to run every minute, in the same cron container as the other scheduled jobs — see
 * docs/reference/ops.md#scheduled-jobs. Idempotent, so a missed or overlapping run costs nothing.
 * `registerModules` is required, not optional: publishing an event is calling its subscribers, and
 * `relayOutbox` refuses to run in a process where none are registered.
 *
 * Removal: none — the outbox is kernel infrastructure, not a module's.
 *
 * See: docs/tools/outbox.md
 */
import '@infrastructure/config/dotenv';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { registerModules } from '@kernel/registry';
import { relayOutbox } from '@kernel/outbox';
import { logger } from '@infrastructure/adapters/logger';
import { enabledModules } from '../../src/modules';
import { runScript } from '../run-script';

/** Connect, install the event subscriptions, publish every due event, and resolve nothing. */
const main = (): Promise<void> =>
    start()
        .then(() => {
            registerModules(enabledModules);
        })
        .then(() => relayOutbox())
        .then((result) => {
            // Stryker disable next-line all
            logger.info({ message: 'outbox: sweep finished', ...result });
        });

// Entry point: run `main`, record the outcome under `sweep:outbox` for `/observability/health`, and close
// the connections on both paths. See `scripts/run-script.ts`.
void runScript('sweep:outbox', main, stopDatabase);
