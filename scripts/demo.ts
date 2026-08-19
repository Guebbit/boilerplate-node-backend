/**
 * The demo profile: the real API, self-contained and disposable.
 *
 * Boots the actual application against an in-memory MongoDB (the same `mongodb-memory-server`
 * the test suite uses), seeds it with every enabled module's demo fixtures, and serves on
 * `NODE_PORT` (default 3000). No Docker, no Redis, no broker — cache and queue run `disabled`,
 * which is a supported deployment shape (see `/observability/health`).
 *
 * This is what the paired frontend's dev server and e2e suite run against instead of a
 * hand-written mock of this API: one implementation of the behaviour, served by the code that
 * owns it. `NODE_DEMO=true` additionally mounts the demo control surface (`POST /__demo/reset`,
 * `GET /__demo/emails`) — see `src/app/demo.ts`.
 *
 * Several instances can run side by side (each owns its own in-memory Mongo):
 *
 *   NODE_PORT=3101 npm run demo
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const REQUIRED_DEFAULTS: Record<string, string> = {
    NODE_ENV: 'development',
    NODE_DEMO: 'true',
    // Real secrets guard real tokens; a demo signs throwaway tokens for a throwaway database.
    NODE_TOKEN_ACCESS: 'demo-access-secret',
    NODE_TOKEN_REFRESH: 'demo-refresh-secret',
    // The e2e suite is not a person browsing: 85 specs from one address clear the human-sized
    // budget in minutes and every 429 downstream reads as "login is broken".
    NODE_RATE_LIMIT_MAX: '1000',
    NODE_AUTH_RATE_LIMIT_MAX: '1000'
};

/** External services have no place here — force-disable whatever the shell happens to carry. */
const FORCED_ABSENT = [
    'NODE_REDIS_URL',
    'NODE_REDIS_HOST',
    'NODE_REDIS_PORT',
    'NODE_AMQP_URL',
    'NODE_AMQP_HOST',
    'NODE_AMQP_PORT'
];

const waitForDatabase = (readyState: () => number): Promise<void> =>
    new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const poll = () => {
            if (readyState() === 1) {
                resolve();
                return;
            }
            if (Date.now() - startedAt > 60_000) {
                reject(new Error('demo: database never connected'));
                return;
            }
            setTimeout(poll, 100);
        };
        poll();
    });

MongoMemoryServer.create()
    .then((mongod) => {
        for (const [key, value] of Object.entries(REQUIRED_DEFAULTS))
            process.env[key] = process.env[key]?.trim() ? process.env[key] : value;
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- assigning undefined would coerce to the string 'undefined'; delete is how an env var is unset
        for (const key of FORCED_ABSENT) delete process.env[key];
        process.env.NODE_DB_URI = mongod.getUri('demo');

        // Import AFTER the environment is shaped — `src/app.ts` boots itself on import.
        return import('../src/app')
            .then(() => import('@infrastructure/runtime/database'))
            .then(({ connection }) => waitForDatabase(() => connection.readyState))
            .then(() => import('../src/app/demo'))
            .then(({ runDemoSeed }) => runDemoSeed(false))
            .then(() => {
                console.log(
                    `[demo] API listening on :${process.env.NODE_PORT ?? '3000'} — in-memory Mongo, seeded, cache/queue disabled.`
                );
            });
    })
    .catch((error: unknown) => {
        console.error('[demo] failed to boot:', error);
        process.exit(1);
    });
