/**
 * A RabbitMQ the broker suite can publish to, and a management handle to poke it with.
 *
 * ── Why the management image ──────────────────────────────────────────────────────────────────
 * Two cases need the HTTP API: reading back the arguments a queue was actually declared with, and
 * dropping a connection from the broker's side. Production runs `rabbitmq:4-alpine`, which has
 * neither plugin; the broker itself is the same.
 *
 * ── The env override comes first ──────────────────────────────────────────────────────────────
 * `NODE_TEST_RABBITMQ_URL` wins when set, which is how CI runs this: a service container is
 * already listening. `NODE_TEST_RABBITMQ_MANAGEMENT_URL` is its HTTP API; unset, it is derived as
 * the same host on 15672 with the AMQP URL's credentials.
 *
 * ── A vhost per run ───────────────────────────────────────────────────────────────────────────
 * Every run declares its topology inside its own virtual host and deletes it afterwards. The
 * adapter's queue and exchange names are fixed (`worker.email.send`, `dead-letter`), so a shared
 * broker that remembered a previous run would answer `PRECONDITION_FAILED` to the next.
 */

import { randomUUID } from 'node:crypto';
import amqplib from 'amqplib';
import { containerEngine, containerEngineAvailable, startContainer } from '@tests/container-engine';

const IMAGE = process.env.NODE_TEST_RABBITMQ_IMAGE ?? 'docker.io/library/rabbitmq:4-management';

/** Credentials of the image's built-in user; both the container and CI use it. */
const CREDENTIALS = 'guest:guest';

/** A broker to run against, scoped to one fresh virtual host. */
export interface TestRabbitMq {
    /** AMQP URL of the run's own vhost, for `NODE_RABBITMQ_URL`. */
    url: string;
    /** The vhost name (unencoded). */
    vhost: string;
    /** Management API calls against this broker's vhost-scoped resources. */
    management: ManagementApi;
    /** Deletes the vhost, then removes the container when this run started one. */
    stop: () => Promise<void>;
}

/** The slice of the management HTTP API the suite uses. */
export interface ManagementApi {
    /** The declared definition of one queue (`type`, `arguments`, `messages` counters). */
    queue: (name: string) => Promise<ManagedQueue>;
    /** Closes every connection open on the run's vhost, from the broker's side. */
    dropConnections: () => Promise<number>;
}

/** What `GET /api/queues/{vhost}/{name}` returns, narrowed to the fields the suite reads. */
export interface ManagedQueue {
    type: string;
    durable: boolean;
    arguments: Record<string, unknown>;
    messages_ready: number;
    messages_unacknowledged: number;
}

/** Parses a response body as JSON, rejecting with the status when the call did not succeed. */
const jsonOrThrow = (response: Response): Promise<unknown> =>
    response.ok
        ? response.json()
        : Promise.reject(
              new Error(`RabbitMQ management ${response.url} answered ${String(response.status)}`)
          );

/**
 * `fetch` against the management API.
 *
 * @param base - the API's origin, with credentials in the URL
 * @param path - the path under `/api`
 * @param init - method and body, when not a plain GET
 */
const call = (base: URL, path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = {
        // Basic auth: `fetch` refuses credentials embedded in a URL, so they travel as a header.
        authorization: `Basic ${Buffer.from(`${decodeURIComponent(base.username)}:${decodeURIComponent(base.password)}`).toString('base64')}`,
        'content-type': 'application/json'
    };
    return fetch(new URL(`/api${path}`, base.origin), { ...init, headers });
};

/** Resolves once the broker accepts an AMQP connection, or rejects after `timeoutMs`. */
const waitForBroker = (url: string, timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs;

    const attempt = (): Promise<void> =>
        amqplib
            .connect(url)
            .then((connection) => connection.close())
            .catch((error: unknown) => {
                if (Date.now() > deadline)
                    throw new Error(`RabbitMQ never answered at ${url}: ${String(error)}`);

                return new Promise<void>((resolve) => setTimeout(resolve, 500)).then(attempt);
            });

    return attempt();
};

/**
 * The vhost's connections, as the management API reports them — which is on its stats interval
 * (5s by default), so a connection opened a moment ago is not listed yet. Polls until one is.
 *
 * @param base - the API origin with credentials
 * @param encoded - the URL-encoded vhost
 * @param deadline - epoch milliseconds after which an empty list is returned as it is
 */
const listConnections = (base: URL, encoded: string, deadline: number): Promise<string[]> =>
    call(base, `/vhosts/${encoded}/connections`)
        .then(jsonOrThrow)
        // The broker's own JSON: only `name` is read off each entry.
        .then((body) => (body as { name: string }[]).map((connection) => connection.name))
        .then((names) => {
            if (names.length > 0 || Date.now() > deadline) return names;
            return new Promise<void>((resolve) => setTimeout(resolve, 500)).then(() =>
                listConnections(base, encoded, deadline)
            );
        });

/**
 * Closes the named connections from the broker's side.
 *
 * @param base - the API origin with credentials
 * @returns a function from connection names to how many were closed
 */
const closeAll = (base: URL) => (names: string[]) =>
    Promise.all(
        names.map((name) =>
            call(base, `/connections/${encodeURIComponent(name)}`, { method: 'DELETE' })
        )
    ).then(() => names.length);

/**
 * The management API, scoped to one vhost.
 *
 * @param base - the API origin with credentials
 * @param vhost - the vhost the run owns
 */
const managementFor = (base: URL, vhost: string): ManagementApi => {
    const encoded = encodeURIComponent(vhost);

    return {
        queue: (name) =>
            call(base, `/queues/${encoded}/${encodeURIComponent(name)}`)
                .then(jsonOrThrow)
                // The broker's own JSON: narrowed here once, so the suite reads typed fields.
                .then((body) => body as ManagedQueue),
        dropConnections: () =>
            listConnections(base, encoded, Date.now() + 20_000).then(closeAll(base))
    };
};

/**
 * Creates the run's vhost and gives the built-in user full rights on it.
 *
 * @param base - the management API origin with credentials
 * @param vhost - the vhost to create
 */
const createVhost = (base: URL, vhost: string): Promise<void> => {
    const encoded = encodeURIComponent(vhost);
    const user = encodeURIComponent(decodeURIComponent(base.username));
    const full = JSON.stringify({ configure: '.*', write: '.*', read: '.*' });

    return call(base, `/vhosts/${encoded}`, { method: 'PUT' })
        .then(() => call(base, `/permissions/${encoded}/${user}`, { method: 'PUT', body: full }))
        .then((response) => {
            if (!response.ok)
                throw new Error(`RabbitMQ refused vhost permissions: ${String(response.status)}`);
        });
};

/**
 * A broker to run against, in a vhost of its own.
 *
 * @returns the vhost's AMQP URL, a management handle, and a `stop`
 * @throws when neither `NODE_TEST_RABBITMQ_URL` nor a container engine is available
 */
export const startRabbitMq = (): Promise<TestRabbitMq> => {
    const provided = process.env.NODE_TEST_RABBITMQ_URL?.trim();
    const providedManagement = process.env.NODE_TEST_RABBITMQ_MANAGEMENT_URL?.trim();

    if (!provided && !containerEngineAvailable())
        return Promise.reject(
            new Error(
                `The broker suite needs a RabbitMQ. No ${containerEngine} found on PATH: set ` +
                    'NODE_TEST_RABBITMQ_URL to an already-listening broker (with the management ' +
                    'plugin), or make a container engine available (CONTAINER_ENGINE, default ' +
                    'podman). This suite refuses to skip: it is the only thing that checks the ' +
                    'queue adapter against a real broker.'
            )
        );

    const container = provided
        ? Promise.resolve(undefined)
        : startContainer({
              image: IMAGE,
              namePrefix: 'node-backend-broker',
              ports: [5672, 15_672]
          });

    return container.then((started) => {
        const amqp = new URL(
            provided ?? `amqp://${CREDENTIALS}@127.0.0.1:${String(started?.hostPorts[0])}`
        );
        const management = new URL(
            providedManagement ??
                `http://${amqp.username}:${amqp.password}@${amqp.hostname}:${String(started?.hostPorts[1] ?? 15_672)}`
        );
        const vhost = `broker-test-${randomUUID().slice(0, 8)}`;
        const root = amqp.href;

        return waitForBroker(root, 90_000)
            .then(() => createVhost(management, vhost))
            .then(() => {
                const scoped = new URL(amqp);
                scoped.pathname = `/${encodeURIComponent(vhost)}`;
                return {
                    url: scoped.href,
                    vhost,
                    management: managementFor(management, vhost),
                    stop: () =>
                        call(management, `/vhosts/${encodeURIComponent(vhost)}`, {
                            method: 'DELETE'
                        })
                            .then(() => undefined)
                            .catch(() => undefined)
                            .then(() => started?.stop())
                };
            });
    });
};
