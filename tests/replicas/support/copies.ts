/**
 * @module
 * N separate single-process copies of the app, one port each, over ONE Mongo (and whatever Redis
 * the case hands them), with a round-robin proxy in front. Nothing here forks from a
 * primary: every copy is its own `node --import tsx src/main.ts`, which is what an
 * orchestrator's replicas are.
 *
 * Each copy is signalled by its own pid (never a process group): one SIGTERM per copy, the way a
 * kubelet sends it.
 *
 * @see docs/build/replicas-testing.md#the-multi-copy-suite
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { startEphemeralMongo } from '@scenarios/support/ephemeral-mongo';
import { startInProcessMongod } from '@scenarios/support/ephemeral-mongod';
import { retryUntil } from '@tests/eventually';
import { REPO_ROOT } from '@tests/paths';
import {
    bootableEnvironment,
    createMarkerCounter,
    freePort,
    stopChild,
    waitForListening
} from '@tests/spawned-app';
import { startRoundRobinProxy, type RoundRobinProxy } from './round-robin';

/** One running copy. */
export interface Copy {
    /** `copy-0`, `copy-1`, ... — the name the proxy reports. */
    name: string;
    /** The port this copy listens on; stable across a restart. */
    port: number;
    /** SIGTERM this copy and wait for it to exit (SIGKILL after 30 s). */
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
    /**
     * The environment every copy runs with, for a plain process that must reach the same stores
     * (a cron container's job, say). It names a port the process never listens on.
     */
    environment: Record<string, string | undefined>;
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
 * The environment one copy runs with: the defaults a fresh checkout boots on, then what makes it
 * one of several, then the case's own overrides.
 *
 * @param options - the copy's port, database, public address and the case's overrides
 */
const copyEnvironment = (options: {
    port: number;
    dbUri: string;
    publicUrl: string;
    env: Record<string, string>;
}): Record<string, string | undefined> => ({
    ...bootableEnvironment({ port: options.port, dbUri: options.dbUri }),
    // One public address for every copy, as behind a real balancer: tokens name it as issuer.
    NODE_URL: options.publicUrl,
    // The proxy is the one hop in front of every copy.
    NODE_TRUST_PROXY_HOPS: '1',
    ...options.env
});

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
        env: copyEnvironment(options),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const output: string[] = [];
    // Split-safe: the ready line can arrive across two `data` events.
    const ready = createMarkerCounter(READY_MARKER);
    const capture = (chunk: Buffer | string): void => {
        const text = String(chunk);
        output.push(text);
        if (output.length > MAX_CAPTURED_CHUNKS)
            output.splice(0, output.length - MAX_CAPTURED_CHUNKS);
        ready.feed(text);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);

    // One SIGTERM to this pid, like a kubelet; the app's own deadline is 15 s, `stopChild` waits past it.
    const stop = (): Promise<void> => stopChild(child).then(() => undefined);

    // One deadline for both waits: the second gets what the first left.
    const deadline = Date.now() + BOOT_TIMEOUT_MS;

    return waitForListening(options.port, BOOT_TIMEOUT_MS)
        .then(() =>
            retryUntil(
                () =>
                    ready.count() > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error('not ready yet')),
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
 * Resolves once the proxy's own polls have seen every copy ready, so a case never sends its first
 * request to a rig whose proxy still answers 503 for the last copy.
 *
 * @param proxy - the proxy in front of the copies
 * @param copies - every copy, all booted
 */
const proxyKnowsEveryCopy = (proxy: RoundRobinProxy, copies: Copy[]): Promise<void> =>
    retryUntil(
        () =>
            proxy.readyNames().length === copies.length
                ? Promise.resolve()
                : Promise.reject(new Error('the proxy has not seen every copy ready yet')),
        BOOT_TIMEOUT_MS,
        50
    );

/**
 * Boots `count` copies behind a round-robin proxy and hands the rig to `use`; stops everything
 * however `use` ends.
 *
 * The proxy starts first, on a port the OS chose: the copies name it as their public address, and
 * no port is chosen and left free for something else to take while they boot.
 *
 * @param options - copy count and environment overrides for every copy
 * @param use - the case
 */
export const withReplicas = <T>(
    options: { count: number; env?: Record<string, string> },
    use: (replicas: Replicas) => Promise<T>
): Promise<T> => {
    const { count, env = {} } = options;
    // Own dbPath under tmp/test/, never the shared os.tmpdir().
    const dbPath = path.join(REPO_ROOT, 'tmp', 'test', 'replicas-mongo', randomUUID());
    const running: { stop: () => Promise<void> }[] = [];
    // The copies this rig holds; the proxy reads it on every poll, so it may start empty.
    const copies: Copy[] = [];
    let mongoStop: () => Promise<void> = () => Promise.resolve();
    let proxyStop: () => Promise<void> = () => Promise.resolve();

    const stopAll = (): Promise<void> =>
        proxyStop()
            .then(() => Promise.all(running.map((one) => one.stop())))
            .then(() => mongoStop())
            .then(() => rm(dbPath, { recursive: true, force: true }));

    /** One copy on its own port; its boot is `start`, its restart the same call again. */
    const makeCopy = (index: number, mongoUri: string, publicUrl: string): Promise<Copy> =>
        freePort().then((port) => {
            let current: { stop: () => Promise<void> } | undefined;
            return {
                name: `copy-${String(index)}`,
                port,
                start: () =>
                    bootCopy({ port, dbUri: mongoUri, publicUrl, env }).then((booted) => {
                        current = booted;
                        running.push(booted);
                    }),
                stop: () => current?.stop() ?? Promise.resolve()
            };
        });

    return mkdir(dbPath, { recursive: true })
        .then(() => startEphemeralMongo({ dbPath, startInProcess: startInProcessMongod }))
        .then((mongo) => {
            mongoStop = mongo.stop;
            return startRoundRobinProxy(() => copies).then((proxy) => {
                proxyStop = proxy.stop;
                const publicUrl = `http://127.0.0.1:${String(proxy.port)}`;
                return Promise.all(
                    Array.from({ length: count }, (_, index) =>
                        makeCopy(index, mongo.uri, publicUrl)
                    )
                ).then((made) => {
                    copies.push(...made);
                    // Sequential: each boot compiles through tsx and the first warms the cache.
                    return startInOrder(copies)
                        .then(() => proxyKnowsEveryCopy(proxy, copies))
                        .then((): Replicas => ({
                            copies,
                            proxy,
                            direct: (index: number) =>
                                `http://127.0.0.1:${String(copies[index].port)}`,
                            environment: copyEnvironment({
                                port: copies[0].port,
                                dbUri: mongo.uri,
                                publicUrl,
                                env
                            }),
                            stop: stopAll
                        }));
                });
            });
        })
        .catch((error: unknown) =>
            stopAll().then(() => {
                throw error;
            })
        )
        .then((replicas) => use(replicas).finally(() => replicas.stop()));
};
