/**
 * @module
 * N separate single-process copies of the app, one port each, over ONE Mongo (and whatever Redis
 * the case hands them), with a round-robin proxy in front. Unlike `tests/cluster/`, nothing here
 * forks from a primary: every copy is its own `node --import tsx src/main.ts`, which is what an
 * orchestrator's replicas are.
 *
 * Each copy is signalled by its own pid (never a process group): one SIGTERM per copy, the way a
 * kubelet sends it.
 *
 * @see docs/build/cluster-testing.md#the-multi-copy-suite
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { startEphemeralMongo } from '@scenarios/support/ephemeral-mongo';
import { startInProcessMongod } from '@scenarios/support/ephemeral-mongod';
import { retryUntil } from '@tests/eventually';
import { REPO_ROOT } from '@tests/paths';
import { bootableEnvironment, freePort, waitForListening } from '../../cluster/support/cluster';
import { startRoundRobinProxy, type RoundRobinProxy } from './round-robin';

/** One running copy. */
export interface Copy {
    /** `copy-0`, `copy-1`, ... — the name the proxy reports. */
    name: string;
    /** The port this copy listens on; stable across a restart. */
    port: number;
    /** SIGTERM this copy and wait for it to exit (SIGKILL after 20 s). */
    stop: () => Promise<void>;
    /** Boots this copy again on the same port and waits until it listens. */
    start: () => Promise<void>;
}

/** The whole rig: the copies, the proxy in front, and the database they share. */
export interface Replicas {
    /** Every copy, in start order. */
    copies: Copy[];
    /** The proxy clients talk to. */
    proxy: RoundRobinProxy;
    /** Direct base URL of one copy, bypassing the proxy. */
    direct: (index: number) => string;
    /** Stops the proxy, every copy and the database. */
    stop: () => Promise<void>;
}

/** The whole boot of one copy (port open, then ready line) must fit in this. */
export const BOOT_TIMEOUT_MS = 90_000;

/** Boot-failure output kept for the error message: the reason is always near the end. */
const MAX_CAPTURED_CHUNKS = 40;

/** What `src/app.ts` logs once the server accepts connections. */
const READY_MARKER = 'Server listening on port';

/**
 * Spawns one copy and resolves once it logged its ready line and accepts connections.
 *
 * @param options - the copy's port, database, and the environment layered over the defaults
 */
const bootCopy = (options: {
    port: number;
    dbUri: string;
    publicUrl: string;
    env: Record<string, string>;
}): Promise<{ child: ChildProcess; stop: () => Promise<void> }> => {
    // `node --import tsx` (the `start` script's entry), not `npx tsx`: the pid signalled is the app's.
    const child = spawn('node', ['--import', 'tsx', 'src/main.ts'], {
        cwd: REPO_ROOT,
        env: {
            ...bootableEnvironment({ port: options.port, dbUri: options.dbUri }),
            // One process per copy: clustering is the other mode and must not fork here.
            NODE_ENABLE_CLUSTERING: '0',
            // One public address for every copy, as behind a real balancer: tokens name it as issuer.
            NODE_URL: options.publicUrl,
            // The proxy is the one hop in front of every copy.
            NODE_TRUST_PROXY_HOPS: '1',
            ...options.env
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const output: string[] = [];
    let sawReady = false;
    const capture = (chunk: Buffer | string): void => {
        const text = String(chunk);
        output.push(text);
        if (output.length > MAX_CAPTURED_CHUNKS)
            output.splice(0, output.length - MAX_CAPTURED_CHUNKS);
        if (text.includes(READY_MARKER)) sawReady = true;
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);

    const stop = (): Promise<void> =>
        new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
                resolve();
                return;
            }
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
            // The app's own deadline is 15 s; past it, stop being polite.
            setTimeout(() => {
                child.kill('SIGKILL');
                resolve();
            }, 20_000).unref();
        });

    // One deadline for both waits: the second gets what the first left.
    const deadline = Date.now() + BOOT_TIMEOUT_MS;

    return waitForListening(options.port, BOOT_TIMEOUT_MS)
        .then(() =>
            retryUntil(
                () => (sawReady ? Promise.resolve() : Promise.reject(new Error('not ready yet'))),
                Math.max(deadline - Date.now(), 0),
                100
            )
        )
        .then(
            () => ({ child, stop }),
            (error: unknown) =>
                stop().then(() => {
                    throw new Error(
                        `${String(error)}\nThe copy's last output:\n${output.join('') || '(nothing)'}`
                    );
                })
        );
};

/**
 * Starts the copies one after the other.
 *
 * @param copies - the copies still to start
 */
const startInOrder = (copies: Copy[]): Promise<void> =>
    copies.length === 0
        ? Promise.resolve()
        : copies[0].start().then(() => startInOrder(copies.slice(1)));

/**
 * Boots `count` copies behind a round-robin proxy and hands the rig to `use`; stops everything
 * however `use` ends.
 *
 * @param options - copy count and environment overrides for every copy
 * @param use - the case
 */
export const withReplicas = <T>(
    options: { count: number; env?: Record<string, string> },
    use: (replicas: Replicas) => Promise<T>
): Promise<T> => {
    const { count, env = {} } = options;
    // Own dbPath under tmp/test/, like the cluster harness: never the shared os.tmpdir().
    const dbPath = path.join(REPO_ROOT, 'tmp', 'test', 'replicas-mongo', randomUUID());
    const running: { stop: () => Promise<void> }[] = [];
    let mongoStop: () => Promise<void> = () => Promise.resolve();

    const stopAll = (proxy?: RoundRobinProxy): Promise<void> =>
        (proxy ? proxy.stop() : Promise.resolve())
            .then(() => Promise.all(running.map((one) => one.stop())))
            .then(() => mongoStop())
            .then(() => rm(dbPath, { recursive: true, force: true }));

    return mkdir(dbPath, { recursive: true })
        .then(() => startEphemeralMongo({ dbPath, startInProcess: startInProcessMongod }))
        .then((mongo) => {
            mongoStop = mongo.stop;
            return Promise.all([
                freePort(),
                ...Array.from({ length: count }, () => freePort())
            ]).then(([proxyPort, ...ports]): Promise<Replicas> => {
                const copies: Copy[] = ports.map((port, index) => {
                    let current: { stop: () => Promise<void> } | undefined;
                    const start = (): Promise<void> =>
                        bootCopy({
                            port,
                            dbUri: mongo.uri,
                            publicUrl: `http://127.0.0.1:${String(proxyPort)}`,
                            env
                        }).then((booted) => {
                            current = booted;
                            running.push(booted);
                        });
                    return {
                        name: `copy-${String(index)}`,
                        port,
                        start,
                        stop: () => current?.stop() ?? Promise.resolve()
                    };
                });
                // Sequential: each boot compiles through tsx and the first warms the cache.
                return startInOrder(copies)
                    .then(() => startRoundRobinProxy(proxyPort, () => copies))
                    .then((proxy) => ({
                        copies,
                        proxy,
                        direct: (index: number) => `http://127.0.0.1:${String(copies[index].port)}`,
                        stop: () => stopAll(proxy)
                    }));
            });
        })
        .catch((error: unknown) =>
            stopAll().then(() => {
                throw error;
            })
        )
        .then((replicas) => use(replicas).finally(() => replicas.stop()));
};
