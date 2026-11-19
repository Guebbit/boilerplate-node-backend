/**
 * @module
 * The boot and the teardown the web process and the worker process share, so the two cannot drift:
 * a step added for one is a step the other has.
 *
 * Owns:        connecting the stores and queue, rendering (i18n, mail templates, admin copy), the
 *              validation messages, and the graceful stop.
 * Does not:    bind consumers (the worker's own last step) or open a listener (each process does).
 *
 * @see docs/understand/scaling.md#graceful-shutdown
 */

import type { Server } from 'node:http';
import { startCache } from '@infrastructure/adapters/cache';
import { startQueue } from '@infrastructure/adapters/queue';
import { registerValidationMessages } from '@infrastructure/http/validation-messages';
import { isLocaleOverrideAvailable, startLocaleOverrideRefresh } from '@infrastructure/i18n';
import { start as startDatabase } from '@infrastructure/runtime/database';
import { shutdownInfra } from '@infrastructure/runtime/server-lifecycle';
import { settleWithin } from '@infrastructure/runtime/settle';
import { settleOutboxNudges } from '@kernel/outbox';
import { bootRendering } from './boot-rendering';
import { registerImageWriteback } from './workers';

/**
 * Connect what both processes need, in the order that works: database, cache, queue (which
 * publishes; consuming is the worker's business), then rendering and the messages that read it.
 *
 * @returns once everything above is up; rejects if a store cannot connect
 */
export const bootProcess = (): Promise<void> =>
    Promise.resolve()
        .then(() => startDatabase())
        .then(() => startCache())
        .then(() => startQueue())
        /**
         * Both roles, with or without a broker: the worker runs the digest job, and the web
         * process runs it inline when the broker is unconfigured or down.
         */
        .then(() => {
            registerImageWriteback();
        })
        // Files, templates, then the admin's edits — the same step every scheduled job runs.
        .then(() => bootRendering())
        /**
         * No provider (`locales` uninstalled) means every refresh would be a no-op forever —
         * a timer with nothing to poll is a leak of intent, not just of a file descriptor.
         */
        .then(() => {
            if (isLocaleOverrideAvailable()) startLocaleOverrideRefresh();
        })
        /**
         * After i18n, because the map resolves its copy through `t`. Registering it earlier
         * would install a translator with no dictionary behind it.
         */
        .then(() => registerValidationMessages());

/**
 * The graceful stop of one process: the listener it opened drains first, then the stores close in
 * the reverse of startup (`shutdownInfra`). A second call joins the first instead of closing twice.
 *
 * @param currentServer - the listener this process opened, read when the stop runs
 * @param afterStop - runs when the teardown settles, to forget that listener
 * @returns the `stop` the process hands to its signal handlers
 */
export const createStop = (
    currentServer: () => Server | undefined,
    afterStop: () => void
): (() => Promise<void>) => {
    /** In-flight shutdown, so a second call joins it instead of closing twice. */
    let shutdownPromise: Promise<void> | undefined;

    return () => {
        if (shutdownPromise) return shutdownPromise;

        /**
         * Relay passes already started finish first: a lost one is only published a minute later
         * by the sweep, but one cut mid-write logs errors at every deploy.
         */
        shutdownPromise = shutdownInfra(currentServer(), (timeoutMs) =>
            settleWithin(new Set([settleOutboxNudges()]), timeoutMs)
        ).finally(() => {
            afterStop();
            shutdownPromise = undefined;
        });

        return shutdownPromise;
    };
};
