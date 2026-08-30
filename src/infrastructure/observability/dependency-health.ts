/**
 * What every backing service this process needs is doing, right now.
 *
 * ── WHY THIS IS READINESS AND `GET /` IS LIVENESS ────────────────────────────────────────────────
 * Two questions, two answers, and conflating them is the classic health-check mistake:
 *
 *   liveness   is the PROCESS alive?              `GET /` — answered by `app/system-routes.ts`,
 *                                                 and what `.docker/Dockerfile.production`'s
 *                                                 HEALTHCHECK probes.
 *   readiness  can it SERVE, and how well?        this module, published by
 *                                                 `GET /observability/health`.
 *
 * They must stay separate because the orchestrator ACTS on liveness: a liveness probe that failed
 * whenever Redis blinked would restart a perfectly healthy container, and restarting it does not
 * bring Redis back. So nothing here feeds the container probe — a degraded service keeps running
 * and says so.
 *
 * ── WHY NO PING, NO TIMEOUT BUDGET ───────────────────────────────────────────────────────────────
 * Not one function below performs I/O. Every dependency already maintains its own live connection
 * state for its own reasons — Mongoose's `readyState`, and the memoised handle each optional
 * dependency keeps through `adapters/managed-connection.ts` — so readiness is a memory read, and
 * this endpoint cannot be the thing that hangs.
 *
 * That is deliberate, not a shortcut taken to avoid the work. A health endpoint that opens sockets
 * is a denial-of-service amplifier pointed at your own infrastructure: it is polled every few
 * seconds, by every replica, forever. The connection state is what the adapters act on anyway —
 * `getCacheValue` skips the cache on exactly the state reported as `unavailable` here — so this
 * reports the truth the application itself runs on rather than a second opinion about it.
 *
 * ── WHY ONE VOCABULARY FOR THREE UNLIKE THINGS ───────────────────────────────────────────────────
 * A document store, a cache and a message broker have nothing in common technically, and each
 * describing itself in its own words is a payload that needs a legend. One enum makes it readable
 * as it stands, and makes `overallStatus` a fold rather than three special cases. `connecting` is kept as its own value rather than folded into `unavailable` because the
 * production HEALTHCHECK allows a start period: during it, "not yet" and "broken" look
 * identical on the wire and mean opposite things to whoever is watching a deploy.
 */

import { connection } from '@infrastructure/runtime/database';
import { cacheState } from '@infrastructure/adapters/cache';
import { queueState } from '@infrastructure/adapters/queue';

/**
 * One dependency's state, in the only four words this payload uses.
 *
 * `disabled` is not a failure and never degrades the service: a deployment that runs without Redis
 * or without RabbitMQ is a supported configuration, and reporting it as broken would train every
 * reader to ignore the field. Mongo has no `disabled` — there is no such deployment.
 */
export type DependencyStatus = 'ready' | 'connecting' | 'unavailable' | 'disabled';

/** Every backing service, named as the payload names them. */
export interface DependencyHealth {
    database: DependencyStatus;
    cache: DependencyStatus;
    queue: DependencyStatus;
}

/**
 * Mongoose's `readyState` integer, in this module's vocabulary.
 *
 * `3` is Mongoose's `disconnecting`. It maps to `unavailable` rather than `connecting` because the
 * two differ in direction: a disconnecting connection is on its way out and will not start serving
 * again, so treating it as "nearly ready" would report a shutdown as a startup.
 */
const DATABASE_STATES: Record<number, DependencyStatus> = {
    0: 'unavailable',
    1: 'ready',
    2: 'connecting',
    3: 'unavailable'
};

/**
 * Read every dependency's current state. No I/O — see this file's header.
 */
export const dependencyHealth = (): DependencyHealth => ({
    database:
        (DATABASE_STATES[connection.readyState] as DependencyStatus | undefined) ?? 'unavailable',
    cache: cacheState(),
    queue: queueState()
});

/**
 * Fold the dependencies into the one word a dashboard colours a dot with.
 *
 * `degraded` rather than a third value for "one optional thing is down", because the distinction a
 * reader acts on is binary: is this instance serving everything it promises, or not. Which part is
 * missing is the `dependencies` map's job to say, and it is right there in the same payload.
 *
 * @param dependencies - the reading to fold, passed in so this stays a pure function
 */
export const overallStatus = (dependencies: DependencyHealth): 'ok' | 'degraded' =>
    Object.values(dependencies).every((status) => status === 'ready' || status === 'disabled')
        ? 'ok'
        : 'degraded';
