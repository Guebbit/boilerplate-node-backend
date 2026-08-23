/**
 * Boots the real thing: `src/cluster.ts`, forking real worker processes, listening on a real port.
 *
 * Every other suite in this repository runs the app in ONE process — supertest against a mounted
 * express app, which is faster and right for almost everything. It is structurally unable to
 * observe the class of bug this directory exists for: state that is correct within a worker and
 * absent across the cluster. A per-process counter looks perfect to a single-process test.
 *
 * So this starts a child, waits for it to listen, and talks to it over TCP.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const REPO_ROOT = path.join(__dirname, '../../..');

export interface Cluster {
    /** The port the cluster's workers share. */
    port: number;
    /** Stops the workers and the database they were given. */
    stop: () => Promise<void>;
}

/**
 * A port nobody is listening on.
 *
 * Asked for by binding to `0` and reading back what the OS assigned, rather than picking a number
 * and hoping. A fixed port is how two concurrent runs come to fight over one socket, and the loser
 * fails with `EADDRINUSE` naming nothing that explains it.
 */
const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.on('error', reject);
        probe.listen(0, () => {
            const { port } = probe.address() as net.AddressInfo;
            probe.close(() => resolve(port));
        });
    });

/** Resolves once something is accepting connections on `port`, or rejects after `timeoutMs`. */
const waitForListening = (port: number, timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs;

    const attempt = (): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const socket = net.connect(port, '127.0.0.1');
            socket.on('connect', () => {
                socket.end(() => resolve());
            });
            socket.on('error', reject);
        }).catch((error: unknown) => {
            if (Date.now() > deadline)
                throw new Error(
                    `The cluster never listened on ${String(port)} within ${String(timeoutMs)}ms: ${String(error)}`
                );

            return new Promise<void>((resolve) => setTimeout(resolve, 250)).then(attempt);
        });

    return attempt();
};

/**
 * Boot a cluster of `workers` processes with `env` layered over the defaults.
 *
 * Its own in-memory Mongo, because the workers connect over TCP from another process and cannot be
 * handed this one's mongoose connection.
 */
export const startCluster = ({
    workers,
    env = {},
    bootTimeoutMs = 60_000
}: {
    workers: number;
    env?: Record<string, string>;
    bootTimeoutMs?: number;
}): Promise<Cluster> =>
    Promise.all([MongoMemoryServer.create(), freePort()]).then(([mongo, port]) => {
        const child: ChildProcess = spawn('npx', ['tsx', 'src/cluster.ts'], {
            cwd: REPO_ROOT,
            env: {
                ...process.env,
                /*
                 * NOT `test`: `src/app.ts` skips its own `startServer()` under `NODE_ENV=test`, so
                 * a cluster booted that way forks workers that mount the app and never listen.
                 */
                NODE_ENV: 'development',
                NODE_PORT: String(port),
                PORT: String(port),
                NODE_DB_URI: mongo.getUri(),
                NODE_TOKEN_ACCESS: 'cluster-suite-access-secret',
                NODE_TOKEN_REFRESH: 'cluster-suite-refresh-secret',
                /*
                 * Clustering is OFF by default — `NODE_ENABLE_CLUSTERING` gates the fork, and
                 * `NODE_CLUSTER_WORKERS` alone does nothing. Without this the child is a single
                 * process, and every assertion about crossing workers passes for the wrong reason.
                 */
                NODE_ENABLE_CLUSTERING: '1',
                NODE_CLUSTER_WORKERS: String(workers),
                ...env
            },
            stdio: ['ignore', 'ignore', 'ignore']
        });

        const stop = (): Promise<void> =>
            new Promise<void>((resolve) => {
                if (child.exitCode !== null || child.signalCode !== null) {
                    resolve();
                    return;
                }
                child.once('exit', () => resolve());
                child.kill('SIGTERM');
                // The primary drains its workers before exiting; past that it is not going to.
                setTimeout(() => {
                    child.kill('SIGKILL');
                    resolve();
                }, 10_000).unref();
            }).then(() => mongo.stop().then(() => undefined));

        return waitForListening(port, bootTimeoutMs).then(
            () => ({ port, stop }),
            (error: unknown) =>
                stop().then(() => {
                    throw error instanceof Error ? error : new Error(String(error));
                })
        );
    });

/**
 * One GET, on its own connection.
 *
 * `agent: false` and `Connection: close` are the whole point of hand-rolling this instead of
 * calling `fetch`: Node's fetch keeps the socket alive and reuses it, and the cluster balances
 * CONNECTIONS. Over one reused socket every request in a burst lands on the same worker — the
 * memory-store case then passes exactly as if the counters were shared, which is the one result
 * this suite must never report by accident.
 */
export const getOnFreshConnection = (port: number, url = '/'): Promise<number> =>
    new Promise((resolve, reject) => {
        const request = http.request(
            { host: '127.0.0.1', port, path: url, agent: false, headers: { connection: 'close' } },
            (response) => {
                response.resume();
                response.on('end', () => resolve(response.statusCode ?? 0));
            }
        );
        request.on('error', reject);
        request.end();
    });

/** How many of each status a burst came back with. */
export const tally = (statuses: number[]): Record<number, number> => {
    const counts: Record<number, number> = {};
    for (const status of statuses) counts[status] = (counts[status] ?? 0) + 1;

    return counts;
};
