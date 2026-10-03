#!/usr/bin/env node

/**
 * @module
 * Serve `createApp()`'s result, wired to the process signals — the one place that actually calls
 * `start()`. `cluster.ts`'s worker branch imports this instead of `./app` directly, and
 * so does `dev:docker` (`tsx src/serve.ts`, in place of clustering, for a hot-reloadable
 * single-process dev loop) — both want the same thing: build the app, start listening, and close
 * everything gracefully on a signal.
 *
 * Deliberately thin: `createApp` stays free of any opinion about whether the process that built
 * it wants to serve traffic at all — `tests/support/http.ts` and `scenarios/apply.ts` are the
 * two callers that do not, and neither needed an environment variable to say so once "build" and
 * "serve" were two different files.
 */

import { createApp } from './app';
import { failBoot, registerSignalHandlers } from '@infrastructure/runtime/server-lifecycle';

/** The one app this process serves: composed by `createApp()`, started below. */
const { start, stop } = createApp();

/** SIGTERM/SIGINT run the app's `stop` (graceful shutdown); a no-op under jest. */
registerSignalHandlers(stop);

/** Listen. A boot failure tears down what already came up, then exits non-zero. */
void start().catch((error: unknown) => failBoot(error, stop));
