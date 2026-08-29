/**
 * The demo profile: the real API, self-contained and disposable — `npm run demo`.
 *
 * Boots the actual application against an in-memory MongoDB, seeds it from every enabled module's
 * fixtures, and serves on `NODE_PORT`. No Docker, no Redis, no broker — cache and queue run
 * `disabled`, which is a supported deployment shape.
 *
 * This is what the paired frontend's dev server and e2e suite run against instead of a hand-written
 * mock. `NODE_DEMO=true` additionally mounts the control surface in `src/app/demo.ts`.
 *
 * Several instances can run side by side, each owning its own in-memory Mongo:
 *
 *   NODE_PORT=3101 npm run demo
 *
 * See: docs/tools/demo-profile.md
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
    NODE_AUTH_RATE_LIMIT_MAX: '1000',
    NODE_AUTH_RATE_LIMIT_ADDRESS_MAX: '1000'
};

/** External services have no place here — force-disable whatever the shell happens to carry. */
const FORCED_ABSENT = [
    'NODE_REDIS_URL',
    'NODE_REDIS_HOST',
    'NODE_REDIS_PORT',
    'NODE_RABBITMQ_URL',
    'NODE_RABBITMQ_HOST',
    'NODE_RABBITMQ_PORT'
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
        // The consumers of this profile end it with a signal — the paired frontend's shard runner
        // and `start-server-and-test` both send SIGTERM. Without this, the process dies and the
        // instance's data directory stays behind under the temp dir (~200 MB per boot); `stop()`
        // is the only thing that removes it.
        for (const signal of ['SIGTERM', 'SIGINT'] as const)
            process.once(signal, () => {
                void mongod
                    .stop()
                    .catch(() => undefined)
                    .then(() => process.exit(0));
            });

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
