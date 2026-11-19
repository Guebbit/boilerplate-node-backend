/**
 * @module
 * The worker process entry: what `npm run dev:worker`, the `worker` compose service and the
 * `worker` Deployment run. Same image as `main.ts`, a different command.
 *
 * Why this order: as in `main.ts`, `dotenv` and `mongoose-boot` only read the environment, OTel
 * starts BEFORE the models, http and the handlers' own dependencies load, and the development
 * doubles register before anything runs a job. The worker is imported dynamically below because a
 * static import would be hoisted above `startTracing()`.
 * Scale by running more copies of this entry, not by forking inside it.
 *
 * @see docs/understand/scaling.md#how-to-run-more-than-one
 */
// First: every other import reads the environment, and this is what loads `.env` into it.
import './infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
// OTel starts before the worker (the models, http) loads: it patches them as required.
import { startTracing } from '@infrastructure/runtime/otel-sdk';
import { logger } from '@infrastructure/adapters/logger';
import { loadDevelopmentDoubles } from '@app/development-doubles';
import { extractErrorMessage } from '@guebbit/js-toolkit';

/** Start the OpenTelemetry SDK before the worker loads the models and http (it patches them). */
startTracing();

/**
 * Register the development doubles (a no-op outside `NODE_ENV=development`), then build the worker,
 * wire the signal handlers and start consuming. A boot failure tears down what already came up and
 * exits non-zero, so a restart policy sees it.
 */
loadDevelopmentDoubles()
    // Dynamic, both: the lifecycle file imports the database and the stores, which tracing patches.
    .then(() =>
        Promise.all([
            import('@app/worker-process'),
            import('@infrastructure/runtime/server-lifecycle')
        ])
    )
    .then(([{ createWorker }, { failBoot, registerSignalHandlers }]) => {
        const { start, stop } = createWorker();
        // SIGTERM/SIGINT stop consuming first, then run `stop`; a no-op under jest.
        registerSignalHandlers(stop);
        return start().catch((error: unknown) => failBoot(error, stop));
    })
    .catch((error: unknown) => {
        logger.error({
            message: 'Could not load the worker.',
            error: extractErrorMessage(error, String(error))
        });
        process.exitCode = 1;
    });
