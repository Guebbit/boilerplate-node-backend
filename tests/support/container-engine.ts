/**
 * Starting a throwaway container from a test, with the engine the repo already names.
 *
 * Why not testcontainers: it talks to a Docker socket, and this repo is podman-first —
 * `.env-example` spells the engine as `${CONTAINER_ENGINE:-podman}`. Using it would mean exporting
 * a podman socket as `DOCKER_HOST` on every machine and in CI: a new dependency AND a workaround
 * for it.
 *
 * Used by the two suites that need a real service the in-process ones cannot fake:
 * `tests/cluster` (Redis) and `tests/broker` (RabbitMQ).
 *
 * @see docs/build/docker-and-podman-podman.md#the-compose-provider-behind-podman-compose
 */

import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { freePort } from './spawned-app';

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

/** Whether a container engine is on PATH and answering. */
export const containerEngineAvailable = (): boolean => {
    try {
        execFileSync(containerEngine, ['info'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
};

/** Label every container {@link startContainer} starts carries, so a sweep can find them. */
const TEST_LABEL = 'node-backend.test';

/** Label holding the pid of the process that started the container. */
export const OWNER_LABEL = 'node-backend.owner-pid';

/** Reads the owner pid out of a `.Labels` string; built from {@link OWNER_LABEL} so they cannot drift. */
const OWNER_PID_PATTERN = new RegExp(
    String.raw`${OWNER_LABEL.replaceAll('.', String.raw`\.`)}=(\d+)`
);

/**
 * Whether a process with this pid is still running.
 *
 * Signal 0 only checks existence. `EPERM` means it exists but belongs to another user: alive.
 *
 * @param pid - the owner pid read from a container label
 */
export const isProcessAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // Narrowed: `process.kill` only throws Node system errors, which carry `code`.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
};

/**
 * Picks the containers whose owner process is gone, from `ps` rows of `<id> <k=v,k=v labels>`.
 *
 * Pure so the "never touch a live owner" rule is testable without an engine. A row it cannot
 * parse is left alone.
 *
 * @param rows - the lines `ps --format "{{.ID}} {{.Labels}}"` printed
 * @param alive - the owner check, injectable for tests
 */
export const orphanedContainerIds = (
    rows: readonly string[],
    alive: (pid: number) => boolean = isProcessAlive
): string[] =>
    rows.flatMap((row) => {
        // Podman and Docker both print `.Labels` as `k=v,k=v`, so the pid is read out by name.
        const id = row.trim().split(/\s+/, 1)[0];
        const pid = Number(OWNER_PID_PATTERN.exec(row)?.[1]);
        return id && Number.isInteger(pid) && pid > 0 && !alive(pid) ? [id] : [];
    });

/**
 * Removes the test containers a killed run left behind.
 *
 * A killed jest never reaches its `afterAll`, and `--rm` never fires because Redis does not
 * exit. Containers whose owner pid is dead are removed; a live owner's (a parallel lane) never.
 * Best effort: a failure here must not fail the run.
 */
const reapOrphanedContainers = (): Promise<void> =>
    new Promise<void>((resolve) => {
        // `ps -a`: include stopped ones; `--filter label=…`: only ours; the format prints all labels.
        execFile(
            containerEngine,
            ['ps', '-a', '--filter', `label=${TEST_LABEL}`, '--format', '{{.ID}} {{.Labels}}'],
            (error, stdout) => {
                const ids = error ? [] : orphanedContainerIds(stdout.split('\n').filter(Boolean));
                if (ids.length === 0) {
                    resolve();
                    return;
                }
                // `rm -f`: stops and removes in one go.
                execFile(containerEngine, ['rm', '-f', ...ids], (rmError) => {
                    if (rmError) {
                        // eslint-disable-next-line no-console -- a failed best-effort sweep is reported, never thrown
                        console.warn(`Could not reap orphaned test containers: ${rmError.message}`);
                    }
                    resolve();
                });
            }
        );
    });

/**
 * Runs one container, detached and removed on exit.
 *
 * `--rm` only fires if the container exits, which Redis never does. Instead it first reaps the
 * containers of dead owners, and the random name keeps two live runs apart.
 *
 * @param spec - the image, name prefix, ports and environment
 * @returns the host ports and a `stop`
 */
export const startContainer = (spec: ContainerSpec): Promise<RunningContainer> => {
    const name = `${spec.namePrefix}-${randomUUID().slice(0, 8)}`;

    return reapOrphanedContainers()
        .then(() => Promise.all(spec.ports.map(() => freePort())))
        .then(
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

                    // `execFile`: starts the container detached (`-d`) and removed on stop (`--rm`), publishing the ports
                    // and env above; the callback gets the error, if any.
                    execFile(
                        containerEngine,
                        [
                            'run',
                            '-d',
                            '--rm',
                            '--name',
                            name,
                            '--label',
                            `${TEST_LABEL}=1`,
                            '--label',
                            `${OWNER_LABEL}=${String(process.pid)}`,
                            ...publish,
                            ...env,
                            spec.image
                        ],
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
