/**
 * A test run never loads a developer's private `.env`.
 *
 * `jest.config.js` points `DOTENV_PATH` at a file that cannot exist, so `src/app.ts`'s
 * `dotenv/config` import finds nothing in any worker or spawned child. Without it a local run
 * inherits the developer's broker and Redis settings while CI, which has no `.env`, does not, and
 * the two disagree.
 *
 * Process:  a real child in a temp directory holding a `.env` with a key that exists nowhere else,
 *           running the app's own loader. Its working directory is where dotenv looks, so this
 *           fails in CI too, where the repository has no `.env` to leak.
 * Async:    spawned asynchronously, so jest's event loop is never blocked.
 *
 * @see docs/reference/tests.md#tests-never-load-env
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from '@tests/paths';

/** `execFile` as a promise: resolves `{ stdout, stderr }`, rejects with the child's error. */
const run = promisify(execFile);

/** The tsx binary the probe runs with. */
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

/** A key no real configuration carries, so seeing it proves THIS file was read. */
const PLANTED_KEY = 'TEST_ENV_ISOLATION_PLANTED_KEY';

/** The directory holding the planted `.env` and the probe; removed after each case. */
let directory: string;

/**
 * Loads the app's own `.env` loader from `directory` and prints the planted key.
 *
 * @param extraEnv - overrides on top of this worker's own environment
 * @returns what the child printed for the planted key: the string 'undefined' when it was not set
 */
const plantedKeyInChild = async (extraEnv: Record<string, string> = {}): Promise<string> => {
    const probe = path.join(directory, 'probe.ts');
    await writeFile(
        probe,
        `import ${JSON.stringify(path.join(REPO_ROOT, 'src/infrastructure/config/dotenv'))};\n` +
            `process.stdout.write(String(process.env.${PLANTED_KEY}));\n`
    );

    const { stdout } = await run(TSX_BIN, [probe], {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, ...extraEnv }
    });
    return stdout;
};

beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'env-isolation-'));
    await writeFile(path.join(directory, '.env'), `${PLANTED_KEY}=from-the-env-file\n`);
});

afterEach(() => rm(directory, { recursive: true, force: true }));

describe('the test environment', () => {
    it('does not load the .env of the directory it runs in', async () => {
        await expect(plantedKeyInChild()).resolves.toBe('undefined');
    });

    // The canary: the same probe, pointed at the planted file, must see the key. Without this the
    // case above would also pass if the probe were simply unable to read a `.env` at all.
    it('would load it if DOTENV_PATH named it', async () => {
        await expect(
            plantedKeyInChild({ DOTENV_PATH: path.join(directory, '.env') })
        ).resolves.toBe('from-the-env-file');
    });
});
