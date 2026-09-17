/**
 * @module
 * What every backing service this process needs is doing, right now — readiness, not liveness.
 * `GET /` answers liveness and drives the orchestrator's restart decision; this answers
 * `GET /observability/health` and must never feed that decision, so a degraded Redis stays
 * degraded instead of killing a healthy container. No I/O: each dependency already tracks its
 * own state, so this is a memory read across one shared vocabulary spanning three unlike backends.
 *
 * See: docs/tools/observability-layer.md
 */

import { connection } from '@infrastructure/runtime/database';
import { cacheState } from '@infrastructure/adapters/cache';
import { queueState } from '@infrastructure/adapters/queue';

/**
 * One dependency's state, in the only four words this payload uses. `disabled` is not a failure
 * and never degrades the service — a deployment without Redis or RabbitMQ is supported, and
 * reporting it as broken would train readers to ignore the field. Mongo has no `disabled`.
 */
export type DependencyStatus = 'ready' | 'connecting' | 'unavailable' | 'disabled';

/** Every backing service, named as the payload names them. */
export interface DependencyHealth {
    database: DependencyStatus;
    cache: DependencyStatus;
    queue: DependencyStatus;
}

/**
 * Mongoose's `readyState` integer, in this module's vocabulary. `3` (`disconnecting`) maps to
 * `unavailable` rather than `connecting`: it is on its way out and will not start serving again,
 * so treating it as "nearly ready" would report a shutdown as a startup.
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
 * Fold the dependencies into the one word a dashboard colours a dot with. `degraded` rather than
 * a third value, because the distinction a reader acts on is binary: serving everything promised,
 * or not — which part is missing is the `dependencies` map's job to say.
 *
 * @param dependencies - the reading to fold, passed in so this stays a pure function
 */
export const overallStatus = (dependencies: DependencyHealth): 'ok' | 'degraded' =>
    Object.values(dependencies).every((status) => status === 'ready' || status === 'disabled')
        ? 'ok'
        : 'degraded';
