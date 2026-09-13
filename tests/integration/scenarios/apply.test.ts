/**
 * `scenarios/apply.ts`'s own gates: the production refusal, the non-empty-database refusal, and
 * `--reset`.
 *
 * Spawned as a real process rather than imported: `tests/unit/scenarios/scenario-images.test.ts`
 * already warns that importing this file SEEDS ON IMPORT, against whatever `process.argv` and
 * `process.env` happen to be at that moment — exactly what this suite needs to control per case,
 * and cannot from inside a shared jest worker. A subprocess is also what `npm run scenario:apply`
 * itself is, so this exercises the real CLI entry point rather than a stand-in for it.
 */

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import mongoose from 'mongoose';
import { seedCredentials } from '@scenarios/accounts';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

/** Module load, Mongo connect and a `blank` seed, for real — measured under 3s locally. */
const APPLY_TIMEOUT_MS = 30_000;

/** How many users `blank` seeds: exactly the named accounts, never a leftover duplicate. */
const NAMED_ACCOUNT_COUNT = Object.keys(seedCredentials).length;

/**
 * Runs `scenarios/apply.ts` for real, against `dbUri` — a database on the same Mongo server every
 * other integration test shares (`NODE_TEST_MONGO_URI`), so no extra server is started for this.
 *
 * Redis and RabbitMQ forced off: neither is under test here, and left alone the `.env` this script
 * loads names the docker-compose hostnames, which cost a real (if short) DNS failure per run.
 */
const runApply = (args: string[], dbUri: string, nodeEnv = 'test') =>
    spawnSync(TSX_BIN, ['scenarios/apply.ts', ...args], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
            ...process.env,
            NODE_ENV: nodeEnv,
            NODE_DB_URI: dbUri,
            NODE_REDIS_CACHE_ENABLED: '0',
            NODE_RABBITMQ_ENABLED: '0'
        }
    });

/** A fresh, never-before-used database on the shared test Mongo server. */
const freshDbUri = (): string =>
    `${process.env.NODE_TEST_MONGO_URI}apply-${randomUUID().slice(0, 8)}`;

describe('scenarios/apply.ts', () => {
    it(
        'refuses to run in production, and never opens the database',
        async () => {
            const dbUri = freshDbUri();

            const result = runApply(['blank'], dbUri, 'production');

            expect(result.status).toBe(0);
            expect(result.stdout + result.stderr).toContain('NODE_ENV is production');

            // The gate returns before `bootAppInProcess()` ever connects — nothing to drop.
            const connection = await mongoose.createConnection(dbUri).asPromise();
            await expect(connection.db?.listCollections().toArray()).resolves.toEqual([]);
            await connection.close();
        },
        APPLY_TIMEOUT_MS
    );

    it(
        'seeds an empty database, refuses a non-empty one, then reseeds after --reset',
        async () => {
            const dbUri = freshDbUri();
            const connection = await mongoose.createConnection(dbUri).asPromise();
            const userCount = () => connection.collection('users').countDocuments();

            const first = runApply(['blank'], dbUri);
            expect(first.status).toBe(0);
            await expect(userCount()).resolves.toBe(NAMED_ACCOUNT_COUNT);

            // Same database, seeded again with no --reset: refused, and left exactly as it was.
            const second = runApply(['blank'], dbUri);
            expect(second.status).toBe(0);
            expect(second.stdout + second.stderr).toContain('already holds data');
            await expect(userCount()).resolves.toBe(NAMED_ACCOUNT_COUNT);

            // --reset empties it first, so the rebuild lands on the same count, not double it.
            const reset = runApply(['--reset', 'blank'], dbUri);
            expect(reset.status).toBe(0);
            expect(reset.stdout + reset.stderr).toContain('Database emptied');
            await expect(userCount()).resolves.toBe(NAMED_ACCOUNT_COUNT);

            await connection.close();
        },
        APPLY_TIMEOUT_MS * 3
    );
});
