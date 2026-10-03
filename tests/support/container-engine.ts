/**
 * Starting a throwaway container from a test, with the engine the repo already names.
 *
 * Why not testcontainers: it talks to a Docker socket, and this repo is podman-first —
 * `.env-example` spells the engine as `${CONTAINER_ENGINE:-podman}`. Using it would mean exporting
 * a podman socket as `DOCKER_HOST` on every machine and in CI: a new dependency AND a workaround
 * for it. `docs/tools/docker-and-podman.md` has the two places the engines differ.
 *
 * Used by the two suites that need a real service the in-process ones cannot fake:
 * `tests/cluster` (Redis) and `tests/broker` (RabbitMQ).
 */

import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

/** The container engine's binary: `CONTAINER_ENGINE`, else podman. */
export const containerEngine = process.env.CONTAINER_ENGINE ?? 'podman';

/** What {@link startContainer} needs to know to run one container. */
export interface ContainerSpec {
    /** The image reference, as the engine's `run` takes it. */
    image: string;
    /** Prefix of the generated container name; a random suffix keeps two runs from colliding. */
    namePrefix: string;
    /** Container-side TCP ports to publish on a free host port each. */
    ports: readonly number[];
    /** Environment variables handed to the container. */
    env?: Readonly<Record<string, string>>;
}

/** A running container: where its published ports landed, and the way to remove it. */
export interface RunningContainer {
    /** The host port each requested container port was published on, in `ports` order. */
    hostPorts: readonly number[];
    /** Removes the container; never rejects, so it is safe in an `afterAll`. */
    stop: () => Promise<void>;
}

/**
 * A port nobody is listening on.
 *
 * Asked for by binding to `0` and reading back what the OS assigned, rather than picking a number
 * and hoping: a fixed port is how two concurrent runs come to fight over one socket.
 */
export const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.on('error', reject);
        probe.listen(0, () => {
            // `address()` is a string only for a pipe/unix socket; this one is TCP.
            const { port } = probe.address() as net.AddressInfo;
            probe.close(() => resolve(port));
        });
    });

/** Whether a container engine is on PATH and answering. */
export const containerEngineAvailable = (): boolean => {
    try {
        execFileSync(containerEngine, ['info'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
};

/**
 * Runs one container, detached and removed on exit.
 *
 * `--rm`, so an interrupted run leaves nothing behind for the next one to collide with; the name is
 * random for the same reason.
 *
 * @param spec - the image, name prefix, ports and environment
 * @returns the host ports and a `stop`
 */
export const startContainer = (spec: ContainerSpec): Promise<RunningContainer> => {
    const name = `${spec.namePrefix}-${randomUUID().slice(0, 8)}`;

    return Promise.all(spec.ports.map(() => freePort())).then(
        (hostPorts) =>
            new Promise<RunningContainer>((resolve, reject) => {
                const publish = spec.ports.flatMap((port, index) => [
                    '-p',
                    `${String(hostPorts[index])}:${String(port)}`
                ]);
                const env = Object.entries(spec.env ?? {}).flatMap(([key, value]) => [
                    '-e',
                    `${key}=${value}`
                ]);

                execFile(
                    containerEngine,
                    ['run', '-d', '--rm', '--name', name, ...publish, ...env, spec.image],
                    // Typed rather than narrowed: node hands back `Error | null`.
                    (error: Error | null) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve({
                            hostPorts,
                            stop: () =>
                                new Promise<void>((done) => {
                                    execFile(containerEngine, ['rm', '-f', name], () => done());
                                })
                        });
                    }
                );
            })
    );
};
