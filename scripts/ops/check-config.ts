#!/usr/bin/env tsx
/**
 * @module
 * Judge the environment and exit — `npm run config:check`. Opens no connection, does no work.
 *
 * Why it exists: `cron`'s healthcheck can only see that supercronic is alive, and every job
 * judges the configuration on its own, so a broken `.env` would read as a healthy container
 * whose every job fails. Run before supercronic, it makes the container fail to start instead.
 *
 * See: docs/tools/health-checks.md
 */
import '@infrastructure/config/dotenv';
import { runScript } from '../run-script';

// `undefined`: not a scheduled job, so no outcome to record. Nothing opened, nothing to close.
void runScript(
    undefined,
    () => Promise.resolve(),
    () => Promise.resolve()
);
