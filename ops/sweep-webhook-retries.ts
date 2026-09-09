#!/usr/bin/env tsx
/**
 * @module
 * Enqueue every webhook delivery due for a retry — `npm run sweep:webhook-retries`.
 *
 * Decision (c) of the delayed-retry story (see `docs/modules/webhooks.md`): a failed attempt with retries left
 * goes back to `pending` with `nextAttemptAt` in the future, rather than sitting in a broker's own
 * delay queue. This sweep is what turns "due" back into a delivered attempt —
 * `sweepDueWebhookDeliveries` (`src/modules/webhooks/services/sweep.ts`) claims each due row
 * atomically before publishing, so a sweep overlapping its own previous run — this schedule is
 * per-minute, unlike the nightly `reap:*`/`sweep:order-effects` jobs — cannot enqueue the same
 * delivery twice. No domain event is emitted here (unlike `sweep-order-effects.ts`), so unlike
 * that script this one has no listener to register modules for.
 *
 * Meant to run every minute, in the same cron container as the other scheduled jobs — see
 * docs/reference/ops.md#scheduled-jobs. Idempotent, so a missed or overlapping run costs nothing.
 *
 * See: docs/reference/ops.md
 */
import 'dotenv/config';
import { start, stopDatabase } from '@infrastructure/runtime/database';
import { sweepDueWebhookDeliveries } from '@modules/webhooks';
import { runScript } from '../db/run-script';

/** Connect, enqueue every due retry, and resolve nothing. */
const main = (): Promise<void> => start().then(() => sweepDueWebhookDeliveries());

void runScript(main, stopDatabase);
