/**
 * `scenarios/apply.ts`'s own gates: the refusal outside development/test, the non-empty-database refusal, and
 * `--reset`.
 *
 * Spawned ASYNCHRONOUSLY, and that is load-bearing: `spawnSync` blocks jest's event loop for the
 * whole run, and jest is what drains the shared `mongod`'s stdout. A seed boots the app and builds
 * every model's indexes, which fills that pipe in seconds; `mongod` then blocks mid-log-line
 * holding its logging latch, its listener stops accepting, and the child waits on answers that
 * never come. See `docs/reference/tests.md`.
 *
 * Spawned as a real process rather than imported: `tests/unit/scenarios/scenario-images.test.ts`
 * already warns that importing this file SEEDS ON IMPORT, against whatever `process.argv` and
 * `process.env` happen to be at that moment — exactly what this suite needs to control per case,
 * and cannot from inside a shared jest worker. A subprocess is also what `npm run scenario:apply`
 * itself is, so this exercises the real CLI entry point rather than a stand-in for it.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { seedCredentials } from '@scenarios/accounts';
import { REPO_ROOT } from '@tests/paths';

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
const runApply = (args: string[], dbUri: string, nodeEnv = 'test'): Promise<ApplyResult> =>
    new Promise((resolve, reject) => {
        const child = execFile(
            TSX_BIN,
            ['scenarios/apply.ts', ...args],
            {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    NODE_ENV: nodeEnv,
                    NODE_DB_URI: dbUri,
                    NODE_REDIS_CACHE_ENABLED: '0',
                    NODE_RABBITMQ_ENABLED: '0'
                }
            },
            // The callback's own error is ignored: a non-zero exit is a case under test here, and
            // `close` below carries the status the assertions actually read.
            () => undefined
        );

        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk: string) => (stdout += chunk));
        child.stderr?.on('data', (chunk: string) => (stderr += chunk));
        child.on('error', reject);
        child.on('close', (status) => {
            resolve({ status, stdout, stderr });
        });
    });

/** What {@link runApply} resolves to: the child's exit status and everything it printed. */
interface ApplyResult {
    /** Exit code, or `null` when the process was killed by a signal instead of exiting. */
    status: number | null;
    /** Everything the run wrote to stdout. */
    stdout: string;
    /** Everything the run wrote to stderr. */
    stderr: string;
}

/**
 * A fresh, never-before-used database on the shared test Mongo server.
 *
 * Through `URL`, not string concatenation: the shared server is a replica set, so its
 * uri carries a `?replicaSet=` query string, and appending a db name onto the end of that
 * (rather than into the path, before it) silently folds into the query value instead of
 * naming a database — replaced by garbage, not by anything spec-walk or a type could catch.
 */
const freshDbUri = (): string => {
    const uri = new URL(process.env.NODE_TEST_MONGO_URI ?? '');
    uri.pathname = `/apply-${randomUUID().slice(0, 8)}`;
    return uri.href;
};

describe('scenarios/apply.ts', () => {
    // An empty value stands for "unset": `dotenv/config` would fill a truly absent one from `.env`.
    it.each(['production', 'staging', ''])(
        'refuses to run with NODE_ENV=%p, and never opens the database',
        async (nodeEnv) => {
            const dbUri = freshDbUri();

            const result = await runApply(['blank'], dbUri, nodeEnv);

            expect(result.status).toBe(1);
            expect(result.stdout + result.stderr).toContain('not development or test');

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

            const first = await runApply(['blank'], dbUri);
            expect(first.status).toBe(0);
            await expect(userCount()).resolves.toBe(NAMED_ACCOUNT_COUNT);

            // Same database, seeded again with no --reset: refused, and left exactly as it was.
            const second = await runApply(['blank'], dbUri);
            expect(second.status).toBe(0);
            expect(second.stdout + second.stderr).toContain('already holds data');
            await expect(userCount()).resolves.toBe(NAMED_ACCOUNT_COUNT);

            // --reset empties it first, so the rebuild lands on the same count, not double it.
            const reset = await runApply(['--reset', 'blank'], dbUri);
            expect(reset.status).toBe(0);
            expect(reset.stdout + reset.stderr).toContain('Database emptied');
            await expect(userCount()).resolves.toBe(NAMED_ACCOUNT_COUNT);

            await connection.close();
        },
        APPLY_TIMEOUT_MS * 3
    );

    it(
        'writes --describe-to into a directory that does not exist yet, with every login in it',
        async () => {
            const scratch = await mkdtemp(path.join(os.tmpdir(), 'apply-describe-'));
            const describeTo = path.join(scratch, 'reports', 'e2e', 'scenario.json');

            const result = await runApply([`--describe-to=${describeTo}`, 'blank'], freshDbUri());

            expect(result.status).toBe(0);
            const described = JSON.parse(await readFile(describeTo, 'utf8')) as {
                scenario: string;
                accounts: Record<string, { email: string }>;
            };
            expect(described.scenario).toBe('blank');
            expect(Object.keys(described.accounts)).toEqual(Object.keys(seedCredentials));

            await rm(scratch, { recursive: true });
        },
        APPLY_TIMEOUT_MS
    );
});
