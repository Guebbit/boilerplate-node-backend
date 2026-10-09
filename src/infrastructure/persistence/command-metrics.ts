/**
 * @module
 * Database command latency (Prometheus), fed by the MongoDB driver's own command monitoring.
 * The driver sees every command whatever path made it — a repository method, a direct
 * `Model.updateOne`, an aggregate — so nothing is counted twice and nothing is missed.
 * `GET /observability/metrics/overview` reads the histogram's `_count` by name.
 *
 * See: docs/tools/prometheus.md
 */

import type { Connection, mongo } from 'mongoose';
import { Histogram } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';

/**
 * Time every database command takes, by collection, command name and outcome.
 * Named after the OpenTelemetry database semantic conventions so stock dashboards understand it.
 */
export const databaseOperationDuration = new Histogram({
    name: 'db_client_operation_duration_seconds',
    help: 'Duration of database commands in seconds, by collection, operation and outcome.',
    // `collection` and `operation` are bounded by the schema and the driver's command set;
    // `outcome` is `success` or `error`.
    labelNames: ['collection', 'operation', 'outcome'] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [metricsRegistry]
});

/** What `commandStarted` knew, kept until the command finishes. */
interface PendingCommand {
    collection: string;
    operation: string;
}

/** Label used when a command targets no collection (`hello`, `endSessions`, `commitTransaction`). */
const NO_COLLECTION = 'none';

/**
 * The collection a command targets: the value under its own name (`{ find: 'users' }`), or
 * `collection` for `getMore`, whose own name holds a cursor id.
 */
const collectionOf = (event: mongo.CommandStartedEvent): string => {
    const named: unknown = event.command[event.commandName];
    if (typeof named === 'string') return named;
    const fallback: unknown = event.command.collection;
    return typeof fallback === 'string' ? fallback : NO_COLLECTION;
};

/** Connections already listening — `start()` can run again, and a second listener would double-count. */
const observed = new WeakSet<object>();

/**
 * Start feeding {@link databaseOperationDuration} from a connected connection. Idempotent.
 * The connection must have been opened with `COMMAND_MONITORING` (`runtime/database.ts`), or no
 * event ever fires.
 */
export const observeDatabaseCommands = (connection: Connection): void => {
    const client = connection.getClient();
    if (observed.has(client)) return;
    observed.add(client);

    // Keyed by the driver's `requestId`, unique per command on this client. Entries leave on
    // BOTH `commandSucceeded` and `commandFailed`, so the map holds only commands in flight.
    const pending = new Map<number, PendingCommand>();

    const finish = (
        event: mongo.CommandSucceededEvent | mongo.CommandFailedEvent,
        outcome: string
    ) => {
        const started = pending.get(event.requestId);
        if (!started) return;
        pending.delete(event.requestId);
        // `duration` is in milliseconds, as measured by the driver.
        databaseOperationDuration.observe({ ...started, outcome }, event.duration / 1000);
    };

    client.on('commandStarted', (event) => {
        pending.set(event.requestId, {
            collection: collectionOf(event),
            operation: event.commandName
        });
    });
    client.on('commandSucceeded', (event) => finish(event, 'success'));
    client.on('commandFailed', (event) => finish(event, 'error'));
};
