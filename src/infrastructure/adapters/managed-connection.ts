/**
 * @module
 * One optional Redis connection's lifecycle, stated once for both the cache adapter and the
 * rate-limit store: unconfigured is a supported deployment, unreachable is a degraded one, and
 * neither may turn a request into an error. That takes the same six pieces every time — memoised
 * handle, shared in-flight connect, warn-once latch, a getter resolving `undefined` instead of
 * rejecting, a `DependencyStatus` reader, and a close — so the rules live here and each adapter
 * supplies only what is genuinely its own. Deliberately does NOT retry on a timer: recovery is
 * demand-driven.
 *
 * RabbitMQ (`queue.ts`) does not use `manageConnection`: amqplib's own opt-in `recovery` retries
 * the CONNECTION forever and re-runs `setup` after every reconnect, which this module has no
 * equivalent for. It does share {@link unavailabilityLatch}, the one piece that generalises.
 *
 * See: docs/tools/redis-cache.md, docs/tools/rabbitmq.md
 */

import { logger } from '@infrastructure/adapters/logger';

/** What {@link unavailabilityLatch} builds: log an outage once, then say whether one was logged. */
export interface UnavailabilityLatch {
    /** Log `error` through the latch's `log` callback, unless already latched. */
    report: (error: unknown) => void;

    /** Reset the latch. Returns whether it had been set — whether a warning was ever logged. */
    clear: () => boolean;
}

/**
 * A warn-once latch: an unreachable dependency fails on every operation that touches it, which is
 * one log line per request rather than one for the outage. `report` logs the first failure in a
 * run of them and stays quiet until `clear` runs; `clear`'s return value is what a caller uses to
 * decide whether a recovery is worth announcing — silent if nobody was ever warned.
 *
 * @param log - called with the error the first time `report` runs after a `clear`
 */
export const unavailabilityLatch = (log: (error: unknown) => void): UnavailabilityLatch => {
    let latched = false;

    return {
        report: (error) => {
            if (latched) return;
            log(error);
            latched = true;
        },
        clear: () => {
            const wasLatched = latched;
            latched = false;
            return wasLatched;
        }
    };
};

/**
 * One dependency's state, in the only four words `GET /observability/health` uses. `disabled` is
 * not a failure and never degrades the service — a deployment without Redis or RabbitMQ is
 * supported, and reporting it as broken would train readers to ignore the field. Mongo has no
 * `disabled` (it has no `isEnabled` concept — connecting is always attempted).
 */
export type DependencyStatus = 'ready' | 'connecting' | 'unavailable' | 'disabled';

/** What an adapter has to supply: how to open, how to check, how to close. */
export interface ManagedConnectionOptions<THandle> {
    /**
     * The single line logged when the dependency is unreachable.
     *
     * Written by the adapter because only it can say what is lost — "continuing without
     * server-side cache" and "queue operations will be skipped" are different promises.
     */
    unavailableMessage: string;

    /**
     * Whether this dependency is configured and not explicitly switched off.
     *
     * Checked before every attempt and read by {@link ManagedConnection.state}, so a deployment
     * that runs without it never opens a socket and reports `disabled` rather than broken.
     */
    isEnabled: () => boolean;

    /**
     * Open the handle. Called at most once at a time; rejecting is how failure is reported.
     *
     * Resolving `undefined` says "cannot be built at all" — configuration that {@link isEnabled}
     * could not rule out — and is treated as unavailable WITHOUT a warning, because nothing failed.
     */
    connect: () => Promise<THandle | undefined>;

    /**
     * Whether a handle already opened can still be used.
     *
     * Called before every reuse, so a dependency that died since the last call is reconnected
     * rather than handed back dead. A handle whose close is supervised (see `queue.ts`, which
     * calls {@link ManagedConnection.forget}) answers `true` — there, a handle still held IS live.
     */
    isReady: (handle: THandle) => boolean;

    /**
     * Close it, from {@link ManagedConnection.stop}.
     *
     * Called with whatever handle is live, or `undefined` when none is — an adapter that opened
     * MORE than the handle still has to close it. `queue.ts`'s handle is a channel that can die
     * while the TCP connection beneath it stays open; closing that connection is what releases it.
     */
    close: (handle: THandle | undefined) => Promise<void>;

    /** Log level for the unavailability warning. Most callers fail open, so `warn` is the default. */
    unavailableLevel?: 'warn' | 'error';

    /** Called once when a connect succeeds after having been reported unavailable. */
    onRecovered?: () => void;
}

/** The lifecycle an adapter drives its public functions from. */
export interface ManagedConnection<THandle> {
    /**
     * The live handle, or `undefined` when the dependency is off, unconfigured or unreachable.
     *
     * NEVER rejects — the property every fail-open adapter is built on. A caller treats
     * `undefined` as "skip it" and can't (or needn't) tell the three cases apart; `clearCache` is
     * the one exception, and separates them with `isEnabled` directly.
     */
    get: () => Promise<THandle | undefined>;

    /**
     * Like {@link get}, but REJECTS instead of resolving `undefined` when the dependency cannot be
     * reached — for the one caller (the rate limiter) that must fail closed, not open.
     */
    getOrThrow: () => Promise<THandle>;

    /** What this connection is doing, for `GET /observability/health`. Performs no I/O. */
    state: () => DependencyStatus;

    /**
     * Drop the memoised handle without closing anything.
     *
     * For an adapter whose handle announces its own death: the close listener forgets it here, and
     * the next `get()` opens a fresh one. That is the whole reconnect strategy.
     */
    forget: () => void;

    /**
     * Log one warning about this dependency being unreachable, then stay quiet until a connect
     * succeeds.
     *
     * Exported because failures arrive outside `connect` too — an `error` event, a command
     * rejected mid-publish — and share the same latch instead of each flooding the log.
     */
    reportUnavailable: (error: unknown) => void;

    /**
     * Close and forget, so a later `get()` starts from a clean state.
     *
     * Waits for an in-flight connect before closing: a socket that finishes opening after shutdown
     * has nobody left to close it and holds the process open.
     */
    stop: () => Promise<void>;
}

/**
 * Build one managed connection.
 *
 * @param options - how to open, check and close the handle; its enablement rule; its outage
 *   message; and two optional knobs, a non-default log level and a recovery callback
 * @returns the lifecycle, closed over module-level state private to this call
 */
export const manageConnection = <THandle>({
    unavailableMessage,
    unavailableLevel = 'warn',
    isEnabled,
    connect,
    isReady,
    close,
    onRecovered
}: ManagedConnectionOptions<THandle>): ManagedConnection<THandle> => {
    /** The shared handle: one per process — a handle per request exhausts the server's limit. */
    let handle: THandle | undefined;

    /** The in-flight connect, so a burst during startup does not thunder-herd its own attempt. */
    let connectPromise: Promise<THandle> | undefined;

    /** Implements {@link ManagedConnection.reportUnavailable} via the shared warn-once latch. */
    const latch = unavailabilityLatch((error) => {
        // Stryker disable all
        if (unavailableLevel === 'error') {
            logger.error({ message: unavailableMessage, error });
        } else {
            logger.warn({ message: unavailableMessage, error });
        }
        // Stryker restore all
    });

    /** `connect()` resolving `undefined` means "cannot be built" — configuration ruled it out, not a failure. */
    class NotConfigured extends Error {}

    /** The one place a connection is actually attempted, deduplicated across concurrent callers. */
    const attempt = (): Promise<THandle> => {
        if (connectPromise) return connectPromise;

        const running: Promise<THandle> = connect()
            .then((opened) => {
                if (opened === undefined) throw new NotConfigured();

                handle = opened;
                // `clear()`'s return is "was a warning ever logged for this outage" — recovery is
                // only worth announcing when one was.
                if (latch.clear()) onRecovered?.();
                return opened;
            })
            .catch((error: unknown) => {
                handle = undefined;
                if (!(error instanceof NotConfigured)) latch.report(error);
                throw error;
            })
            .finally(() => {
                // Cleared either way, so the next call can retry a dependency that was down.
                connectPromise = undefined;
            });

        connectPromise = running;

        return running;
    };

    /** Implements {@link ManagedConnection.getOrThrow} — fail closed instead of resolving `undefined`. */
    const getOrThrow = (): Promise<THandle> => {
        if (!isEnabled()) return Promise.reject(new NotConfigured());
        if (handle && isReady(handle)) return Promise.resolve(handle);
        return attempt();
    };

    /** Implements {@link ManagedConnection.get} — the fail-open getter every adapter calls. */
    const get = (): Promise<THandle | undefined> => {
        // Disabled → resolve with nothing. Every caller treats that as "skip this dependency".
        if (!isEnabled()) return Promise.resolve(undefined);
        // Reuse a handle that is still good; a dead one falls through to a fresh attempt.
        if (handle && isReady(handle)) return Promise.resolve(handle);
        // Resolve, never reject: a failed connect is a skipped optimisation, not a failed request.
        return attempt().catch(() => undefined);
    };

    return {
        get,
        getOrThrow,

        state: () => {
            if (!isEnabled()) return 'disabled';
            if (handle && isReady(handle)) return 'ready';
            // One rule for every managed dependency, rather than each client's own socket flags:
            // the handshake window is exactly the time an attempt is in flight.
            if (connectPromise) return 'connecting';
            return 'unavailable';
        },

        forget: () => {
            handle = undefined;
        },

        reportUnavailable: latch.report,

        stop: () => {
            // An attempt still running owns the handle this is about to close, so it is settled
            // first. If it rejects, there was never a handle to close — `close(undefined)` would
            // have been a no-op anyway, so the catch below skips straight past it.
            const settled = connectPromise ?? Promise.resolve(handle);

            return (
                settled
                    .then(close)
                    // Shutdown is the one path that must not raise. An already-dead socket rejecting
                    // its own close is the ordinary case here and there is nothing to salvage: the
                    // process is on its way out and the next boot starts from a fresh handle.
                    .catch(() => undefined)
                    .finally(() => {
                        handle = undefined;
                        connectPromise = undefined;
                        latch.clear();
                    })
            );
        }
    };
};
