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

/**
 * How many of the child's output chunks to keep for the error message when it never listens.
 *
 * Chunks, not lines — this is a stream, and a chunk boundary falls wherever the OS put it. Bounded
 * because a boot that fails late can write thousands of lines first and a jest failure carrying all
 * of them is unreadable; the reason is always near the end.
 */
const MAX_CAPTURED_CHUNKS = 40;

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
const startCluster = ({
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
            // A new process group, PGID == this PID: `stop()` below signals the whole group, not
            // just this one process — see its own docblock for why that is the point.
            detached: true,
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
                 * `NODE_ENV: 'development'` above means `assertRequiredConfig` runs for real —
                 * unlike every other suite, which sets `NODE_ENV=test` and skips it. A local `.env`
                 * (via `dotenv/config` in `src/app.ts`) supplies these on a dev machine; CI has none,
                 * so the child refuses to boot without them (`src/kernel/required-config.ts`).
                 */
                NODE_URL: `http://127.0.0.1:${String(port)}`,
                NODE_TOTP_ENCRYPTION_KEY: 'cluster-suite-totp-encryption-key',
                NODE_WEBHOOK_SECRET_ENCRYPTION_KEY: 'cluster-suite-webhook-secret-encryption-key',
                /*
                 * Clustering is OFF by default — `NODE_ENABLE_CLUSTERING` gates the fork, and
                 * `NODE_CLUSTER_WORKERS` alone does nothing. Without this the child is a single
                 * process, and every assertion about crossing workers passes for the wrong reason.
                 */
                NODE_ENABLE_CLUSTERING: '1',
                NODE_CLUSTER_WORKERS: String(workers),
                ...env
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        /*
         * Kept so a boot failure can say WHY. Discarding the child's output made every failure here
         * read as a bare 60-second timeout with no cause attached, which is how a red `cluster` job
         * stayed unexplained: the process that knew what went wrong was the one nobody was reading.
         */
        const output: string[] = [];
        const capture = (chunk: Buffer | string): void => {
            output.push(String(chunk));
            if (output.length > MAX_CAPTURED_CHUNKS)
                output.splice(0, output.length - MAX_CAPTURED_CHUNKS);
        };
        child.stdout?.on('data', capture);
        child.stderr?.on('data', capture);

        /*
         * Signals the whole process GROUP, not just `child` — which is `npx`, not the cluster
         * primary two levels down, and never the workers `cluster.fork()` adds below that again.
         * `child.kill()` alone only ever reaches `npx`; whether SIGTERM cascades from there to
         * `tsx`, to the primary, and finally to every forked worker depends on each layer
         * forwarding it, which this suite cannot rely on. `detached: true` above put `child` at
         * the head of a fresh process group (PGID == its own PID), so `-child.pid` addresses
         * every process in it — `npx`, `tsx`, the primary, and its workers — in one signal,
         * however many layers deep the chain runs.
         *
         * Wrapped in `try`/`catch`: `process.kill` throws ESRCH when the group is already gone,
         * which "already exited, nothing left to signal" always eventually is.
         */
        const signalGroup = (signal: NodeJS.Signals): void => {
            try {
                if (child.pid !== undefined) process.kill(-child.pid, signal);
            } catch {
                /* group already gone */
            }
        };

        const stop = (): Promise<void> =>
            new Promise<void>((resolve) => {
                if (child.exitCode !== null || child.signalCode !== null) {
                    resolve();
                    return;
                }
                child.once('exit', () => resolve());
                signalGroup('SIGTERM');
                /*
                 * The primary's own graceful cascade (`src/cluster.ts`'s `startPrimaryShutdown`)
                 * has up to `NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS` (15s default) to drain its workers
                 * on its own; this waits past that before stepping in, so the normal path is the
                 * primary finishing on its own, not this forcing it. The SIGKILL that follows
                 * still goes to the whole group — not just the primary — so a worker the primary
                 * hasn't gotten to yet dies too, rather than surviving as an orphan that keeps
                 * `child.stdout`/`stderr` (inherited down the whole chain) from ever reaching EOF,
                 * which is what left a passing test run unable to make Jest exit.
                 */
                setTimeout(() => {
                    signalGroup('SIGKILL');
                    resolve();
                }, 20_000).unref();
            }).then(() => mongo.stop().then(() => undefined));

        return waitForListening(port, bootTimeoutMs).then(
            () => ({ port, stop }),
            (error: unknown) =>
                stop().then(() => {
                    const reason = error instanceof Error ? error.message : String(error);
                    throw new Error(
                        `${reason}\nThe child's last output:\n${output.join('') || '(nothing — it wrote neither stdout nor stderr)'}`
                    );
                })
        );
    });

/**
 * Boot a cluster, hand it to `use`, and stop it however that ends.
 *
 * The lifecycle lives here rather than in each case because the obvious hand-rolled shape — a
 * `let cluster` assigned inside a `.then`, stopped in a `.finally` — throws
 * `Cannot read properties of undefined (reading 'stop')` when the boot itself fails, replacing the
 * real reason with a TypeError from the cleanup.
 */
export const withCluster = <T>(
    options: Parameters<typeof startCluster>[0],
    use: (cluster: Cluster) => Promise<T>
): Promise<T> =>
    startCluster(options).then((cluster) => use(cluster).finally(() => cluster.stop()));

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
