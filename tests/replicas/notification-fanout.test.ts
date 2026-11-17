/**
 * @module
 * A live notification stream is held by ONE copy, yet the write it must report can happen
 * anywhere: another copy, or a cron container's sweep that has no streams at all. Each case holds
 * a stream on one copy and writes through something else, so only the shared Redis can carry the
 * frame across.
 *
 * Every case reads a frame the writer's own process could not have delivered, which is the
 * control: a copy that answered alone would never produce it.
 *
 * @see docs/build/cluster-testing.md#the-multi-copy-suite
 * @see docs/modules/notifications.md#more-than-one-process
 */

import { spawn } from 'node:child_process';
import { containerEngineAvailable } from '@tests/container-engine';
import { retryUntil } from '@tests/eventually';
import { REPO_ROOT } from '@tests/paths';
import { startRedis, type TestRedis } from '../cluster/support/redis';
import { call, jsonHeaders, signUpAndLogIn } from './support/client';
import { BOOT_TIMEOUT_MS, withReplicas } from './support/copies';
import { openNotificationStream, type HeldStream } from './support/event-stream';

/** Copies behind the proxy. */
const COPIES = 2;

/** Copies boot one after another, each within its own deadline; the margin covers a Redis pull. */
jest.setTimeout(COPIES * BOOT_TIMEOUT_MS + 120_000);

/** A frame crossing Redis takes milliseconds; this is the failure budget, not the expectation. */
const FRAME_TIMEOUT_MS = 5000;

/** How long the writer process gets to connect, write and exit. */
const WRITER_TIMEOUT_MS = 60_000;

/**
 * Runs the plain writer process for `userId` against the rig's stores and resolves once it exited 0.
 *
 * @param env - the copies' environment, so the writer reaches the same Mongo and Redis
 * @param userId - whose inbox it writes to
 */
const writeFromAnotherProcess = (
    env: Record<string, string | undefined>,
    userId: string
): Promise<void> =>
    new Promise((resolve, reject) => {
        const child = spawn(
            'node',
            ['--import', 'tsx', 'tests/replicas/support/write-notification.ts', userId],
            {
                cwd: REPO_ROOT,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: WRITER_TIMEOUT_MS
            }
        );
        const output: string[] = [];
        child.stdout.on('data', (chunk: Buffer) => output.push(String(chunk)));
        child.stderr.on('data', (chunk: Buffer) => output.push(String(chunk)));
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0
                ? resolve()
                : reject(new Error(`The writer exited ${String(code)}:\n${output.join('')}`))
        );
    });

/** How long one attempt waits for its frame before the next one is sent. */
const ATTEMPT_WAIT_MS = 500;

/** The whole window for the subscriber of the copy holding the stream to come up. */
const SUBSCRIBE_WINDOW_MS = 30_000;

/**
 * Marks the account's inbox read through `viaCopy`, again and again, until `stream` (held by
 * ANOTHER copy) has received the frame. The subscriber opens with the stream and Redis keeps no
 * message for a subscriber that is not there yet, so a first write can be lost; the first frame
 * that arrives proves the subscription is live. No sleeps: the loop ends on the first frame.
 *
 * @param viaCopy - base URL of the copy that writes, not the one holding the stream
 * @param bearer - the account's access token
 * @param stream - the held stream waiting for the frame
 */
const readAllUntilHeard = (viaCopy: string, bearer: string, stream: HeldStream): Promise<void> =>
    retryUntil(
        () =>
            call(viaCopy, '/notifications/read-all', {
                method: 'POST',
                headers: jsonHeaders(bearer)
            }).then((answer) => {
                expect(answer.status).toBe(204);
                return stream.waitForEvent('notifications.read', ATTEMPT_WAIT_MS);
            }),
        SUBSCRIBE_WINDOW_MS,
        50
    );

describe('live notifications across processes', () => {
    let redis: TestRedis;

    beforeAll(() => {
        if (!containerEngineAvailable() && !process.env.NODE_TEST_REDIS_URL)
            throw new Error(
                'The replicas suite needs a Redis. Start one and set NODE_TEST_REDIS_URL, or make ' +
                    'a container engine available (CONTAINER_ENGINE, default podman). It refuses to ' +
                    'skip: a frame nobody carried across is what it exists for.'
            );
        return startRedis().then((started) => {
            redis = started;
        });
    });

    afterAll(() => redis.stop());

    it('delivers a frame written through copy B to a stream held on copy A', () =>
        withReplicas({ count: COPIES, env: { NODE_REDIS_URL: redis.url } }, (replicas) => {
            const proxy = `http://127.0.0.1:${String(replicas.proxy.port)}`;
            return signUpAndLogIn(proxy, 'fanout-reader').then(async ({ bearer, cookie }) => {
                const stream = await openNotificationStream(replicas.direct(0), cookie);
                try {
                    // The write goes through the OTHER copy, whose own streams are none.
                    await readAllUntilHeard(replicas.direct(1), bearer, stream);
                    expect(stream.received()).toContain('event: notifications.read');
                } finally {
                    await stream.close();
                }
            });
        }));

    it('delivers a notification a plain process wrote, as a cron sweep does', () =>
        withReplicas({ count: COPIES, env: { NODE_REDIS_URL: redis.url } }, (replicas) => {
            const proxy = `http://127.0.0.1:${String(replicas.proxy.port)}`;
            return signUpAndLogIn(proxy, 'cron-reader').then(async ({ bearer, cookie }) => {
                const me = await call(replicas.direct(0), '/account', {
                    headers: jsonHeaders(bearer)
                });
                // Narrowing: the account contract answers its own `id`.
                const { id } = me.body as { id: string };
                const stream = await openNotificationStream(replicas.direct(0), cookie);
                try {
                    // The subscriber must be live before the writer runs: the writer's one frame is not retried.
                    await readAllUntilHeard(replicas.direct(1), bearer, stream);
                    await writeFromAnotherProcess(replicas.environment, id);

                    await stream.waitForEvent('notifications.created', FRAME_TIMEOUT_MS);
                    expect(stream.received()).toContain('from-the-cron-process');
                } finally {
                    await stream.close();
                }
            });
        }));
});
