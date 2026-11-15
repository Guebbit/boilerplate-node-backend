/**
 * @module
 * The default process entry: one process, one app. What `npm start`, `npm run dev`, `e2e:serve`,
 * `debug`, `dev:docker` and the production image's CMD run.
 *
 * Why this order: OTel must start BEFORE express and mongoose load (it patches them), and `serve`
 * is imported dynamically below because a static import would be hoisted above `startTracing()`.
 * `src/cluster.ts` is the other entry (`npm run start:cluster`, a bare VM with no process manager).
 *
 * See: docs/understand/clustering.md
 */
// First: every other import reads the environment, and this is what loads `.env` into it.
import './infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
// OTel must initialize before any other module is loaded.
import { startTracing } from '@infrastructure/runtime/otel-sdk';
import { logger } from '@infrastructure/adapters/logger';
import { extractErrorMessage } from '@guebbit/js-toolkit';

/** Start the OpenTelemetry SDK before express/http/mongoose are loaded (it patches them). */
startTracing();

/** Build, listen and wire the signal handlers. Side-effect only: nothing needs the instance back. */
import('./serve').catch((error: unknown) => {
    logger.error({
        message: 'Could not load the server.',
        error: extractErrorMessage(error, String(error))
    });
    process.exitCode = 1;
});
