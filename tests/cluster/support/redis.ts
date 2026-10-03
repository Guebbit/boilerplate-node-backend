/**
 * A Redis the cluster suite can count in.
 *
 * ── Why not testcontainers ────────────────────────────────────────────────────────────────────
 * See `tests/support/container-engine.ts`: the engine the repo already names starts the container,
 * with no new dependency.
 *
 * ── The env override comes first ──────────────────────────────────────────────────────────────
 * `NODE_TEST_REDIS_URL` wins when it is set, which is how CI runs this: a service container is
 * already listening, and starting a second one inside the job would be slower and no more real.
 */

import net from 'node:net';
import { containerEngine, containerEngineAvailable, startContainer } from '@tests/container-engine';

const IMAGE = process.env.NODE_TEST_REDIS_IMAGE ?? 'docker.io/library/redis:7-alpine';

export interface TestRedis {
    url: string;
    stop: () => Promise<void>;
}

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

/**
 * A Redis to count in, and the way to stop it.
 *
 * The container is named per run and started with `--rm`, so an interrupted run leaves nothing
 * behind for the next one to collide with.
 */
export const startRedis = (): Promise<TestRedis> => {
    const provided = process.env.NODE_TEST_REDIS_URL?.trim();
    if (provided) return Promise.resolve({ url: provided, stop: () => Promise.resolve() });

    if (!containerEngineAvailable())
        return Promise.reject(
            new Error(
                `No ${containerEngine} found on PATH. Set NODE_TEST_REDIS_URL to an already-listening Redis ` +
                    '— the only option inside a container, which cannot start its own — or make a ' +
                    'container engine available (CONTAINER_ENGINE, default podman).'
            )
        );

    return startContainer({
        image: IMAGE,
        namePrefix: 'node-backend-cluster-redis',
        ports: [6379]
    }).then(({ hostPorts, stop }) => {
        const [port] = hostPorts;
        return waitForPong(port, 60_000).then(() => ({
            url: `redis://127.0.0.1:${String(port)}`,
            stop
        }));
    });
};
