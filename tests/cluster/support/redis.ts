/**
 * A Redis the cluster suite can count in.
 *
 * ── Why not testcontainers ────────────────────────────────────────────────────────────────────
 * It is the obvious dependency for this and it was not taken. Testcontainers talks to a Docker
 * socket, and this repo is podman-first — `.env-example` spells the engine as
 * `${CONTAINER_ENGINE:-podman}` and `docs/tools/docker-and-podman.md` explains the two places they
 * differ. Making testcontainers work here means exporting a podman socket as `DOCKER_HOST` on
 * every machine and in CI: a new dependency AND a workaround for it. Starting a container with the
 * engine the repo already names is thirty lines and no dependency.
 *
 * ── The env override comes first ──────────────────────────────────────────────────────────────
 * `NODE_TEST_REDIS_URL` wins when it is set, which is how CI runs this: a service container is
 * already listening, and starting a second one inside the job would be slower and no more real.
 */

import { execFile, execFileSync } from 'node:child_process';
import net from 'node:net';
import { randomUUID } from 'node:crypto';

const ENGINE = process.env.CONTAINER_ENGINE ?? 'podman';
const IMAGE = process.env.NODE_TEST_REDIS_IMAGE ?? 'docker.io/library/redis:7-alpine';

export interface TestRedis {
    url: string;
    stop: () => Promise<void>;
}

const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.on('error', reject);
        probe.listen(0, () => {
            const { port } = probe.address() as net.AddressInfo;
            probe.close(() => resolve(port));
        });
    });

/** Resolves when Redis answers `PING`, or rejects once `timeoutMs` has passed. */
const waitForPong = (port: number, timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs;

    const attempt = (): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const socket = net.connect(port, '127.0.0.1');
            socket.on('connect', () => socket.write('PING\r\n'));
            socket.on('data', (chunk) => {
                socket.end();
                if (chunk.toString().startsWith('+PONG')) resolve();
                else reject(new Error(`Redis answered ${chunk.toString().trim()}`));
            });
            socket.on('error', reject);
        }).catch((error: unknown) => {
            if (Date.now() > deadline)
                throw new Error(`Redis never answered on ${String(port)}: ${String(error)}`);

            return new Promise<void>((resolve) => setTimeout(resolve, 250)).then(attempt);
        });

    return attempt();
};

/** Whether a container engine is on PATH and answering. */
export const containerEngineAvailable = (): boolean => {
    try {
        execFileSync(ENGINE, ['info'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
};

/**
 * A Redis to count in, and the way to stop it.
 *
 * The container is named per run and started with `--rm`, so an interrupted run leaves nothing
 * behind for the next one to collide with.
 */
export const startRedis = (): Promise<TestRedis> => {
    const provided = process.env.NODE_TEST_REDIS_URL?.trim();
    if (provided) return Promise.resolve({ url: provided, stop: () => Promise.resolve() });

    const name = `node-backend-cluster-redis-${randomUUID().slice(0, 8)}`;

    return freePort()
        .then(
            (port) =>
                new Promise<number>((resolve, reject) => {
                    execFile(
                        ENGINE,
                        ['run', '-d', '--rm', '--name', name, '-p', `${String(port)}:6379`, IMAGE],
                        // Typed rather than narrowed: node hands back `Error | null`, so the
                        // rejection reason is already an Error and needs no coercion.
                        (error: Error | null) => {
                            if (error) reject(error);
                            else resolve(port);
                        }
                    );
                })
        )
        .then((port) =>
            waitForPong(port, 60_000).then(() => ({
                url: `redis://127.0.0.1:${String(port)}`,
                stop: () =>
                    new Promise<void>((resolve) => {
                        execFile(ENGINE, ['rm', '-f', name], () => resolve());
                    })
            }))
        );
};
