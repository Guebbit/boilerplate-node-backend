/**
 * @module
 * The default process entry: one process, one app. What `npm start`, `npm run dev`, `e2e:serve`,
 * `debug`, `dev:docker` and the production image's CMD run.
 *
 * Why this order: OTel starts BEFORE `serve` loads express, http and the models (it patches them as
 * they are first required). `dotenv` and `mongoose-boot` come first because they only read the
 * environment and set Mongoose defaults. `serve` is imported dynamically below because a static
 * import would be hoisted above `startTracing()`.
 * Under `NODE_ENV=development` the development doubles load after tracing and before `serve`, so
 * they are registered before the config gate and any request.
 * `src/cluster.ts` is the other entry (`npm run start:cluster`, a bare VM with no process manager).
 *
 * @see docs/understand/clustering.md#two-ways-to-run-it
 */
// First: every other import reads the environment, and this is what loads `.env` into it.
import './infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
// OTel starts before `serve` (express, http, the models) loads: it patches them as required.
import { startTracing } from '@infrastructure/runtime/otel-sdk';
import { logger } from '@infrastructure/adapters/logger';
import { loadDevelopmentDoubles } from '@app/development-doubles';
import { extractErrorMessage } from '@guebbit/js-toolkit';

/** Start the OpenTelemetry SDK before `serve` loads express, http and the models (it patches them). */
startTracing();

/**
 * Register the development doubles (a no-op outside `NODE_ENV=development`), then build, listen
 * and wire the signal handlers. Side-effect only: nothing needs the instance back.
 */
loadDevelopmentDoubles()
    .then(() => import('./serve'))
    .catch((error: unknown) => {
        logger.error({
            message: 'Could not load the server.',
            error: extractErrorMessage(error, String(error))
        });
        process.exitCode = 1;
    });
