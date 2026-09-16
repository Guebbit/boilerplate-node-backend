/**
 * @module
 * The file sandbox — `tests/support/file-sandbox.ts`.
 *
 * It is what keeps a test run from writing onto the developer's machine, so both halves are
 * asserted: that writes are redirected, and that a file left behind is found and attributed.
 * Real directories under a temp root, not a mocked `fs` — the question is what is on disk.
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    FILE_SANDBOX_ROOT_VARIABLE,
    applyFileSandbox,
    describeLeftovers,
    emptyFileSandbox,
    leftoverFiles,
    sandboxDirectory
} from '@tests/file-sandbox';

/** The settings the sandbox owns, saved so this file can restore its own sandbox afterwards. */
const OWNED_VARIABLES = [
    FILE_SANDBOX_ROOT_VARIABLE,
    'NODE_PUBLIC_PATH',
    'NODE_QUARANTINE_PATH',
    'NODE_UPLOAD_STAGING_PATH'
] as const;

/** A test file path as jest would report it, inside the repository. */
const TEST_PATH = path.join(__dirname, '..', '..', 'integration', 'uploads.test.ts');

/** The environment this file itself was started with. */
const original = Object.fromEntries(OWNED_VARIABLES.map((name) => [name, process.env[name]]));

/** A scratch sandbox root, recreated per test. */
let root: string;

/**
 * Writes a file, creating its directory first.
 *
 * @param file - the absolute path to write
 */
const touch = async (file: string): Promise<void> => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'x');
};

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'file-sandbox-test-'));
    process.env[FILE_SANDBOX_ROOT_VARIABLE] = root;
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    for (const name of OWNED_VARIABLES) process.env[name] = original[name];
});

describe('sandboxDirectory', () => {
    it('names the directory after the repo-relative test path, separators flattened', () => {
        expect(sandboxDirectory(root, TEST_PATH)).toBe(
            path.join(root, 'tests__integration__uploads.test.ts')
        );
    });
});

describe('applyFileSandbox', () => {
    it('points every file-writing setting into the test file’s own sandbox', () => {
        process.env.NODE_PUBLIC_PATH = 'public';

        applyFileSandbox(TEST_PATH);

        const directory = sandboxDirectory(root, TEST_PATH);
        expect(process.env.NODE_PUBLIC_PATH).toBe(path.join(directory, 'public'));
        expect(process.env.NODE_QUARANTINE_PATH).toBe(path.join(directory, 'quarantine'));
        expect(process.env.NODE_UPLOAD_STAGING_PATH).toBe(path.join(directory, 'uploads'));
    });

    it('refuses to run without a sandbox root, rather than fall back to real directories', () => {
        delete process.env[FILE_SANDBOX_ROOT_VARIABLE];

        expect(() => applyFileSandbox(TEST_PATH)).toThrow(FILE_SANDBOX_ROOT_VARIABLE);
    });

    it('refuses to run when jest reports no test path', () => {
        expect(() => applyFileSandbox(undefined)).toThrow('no test path');
    });
});

describe('emptyFileSandbox', () => {
    it('deletes every file the test file wrote, in all three directories', async () => {
        applyFileSandbox(TEST_PATH);
        const written = [
            path.join(process.env.NODE_PUBLIC_PATH ?? '', 'images', 'thumbs', 'v1', 'a.webp'),
            path.join(process.env.NODE_QUARANTINE_PATH ?? '', 'a.png'),
            path.join(process.env.NODE_UPLOAD_STAGING_PATH ?? '', 'a.png')
        ];
        await Promise.all(written.map((file) => touch(file)));

        await emptyFileSandbox();

        expect(written.filter((file) => existsSync(file))).toEqual([]);
        await expect(leftoverFiles(root)).resolves.toEqual([]);
    });

    it('refuses a setting outside the sandbox root, and deletes nothing', async () => {
        applyFileSandbox(TEST_PATH);
        const outside = await mkdtemp(path.join(tmpdir(), 'file-sandbox-outside-'));
        const precious = path.join(outside, 'images', 'keep.png');
        await touch(precious);
        process.env.NODE_PUBLIC_PATH = outside;

        await expect(emptyFileSandbox()).rejects.toThrow('NODE_PUBLIC_PATH is outside');
        expect(existsSync(precious)).toBe(true);

        await rm(outside, { recursive: true, force: true });
    });
});

describe('leftoverFiles', () => {
    it('finds nothing under a root that does not exist', async () => {
        await expect(leftoverFiles(path.join(root, 'missing'))).resolves.toEqual([]);
    });

    it('ignores empty directories — only a file is a leftover', async () => {
        await mkdir(path.join(root, 'tests__a.test.ts', 'public', 'images', 'thumbs'), {
            recursive: true
        });

        await expect(leftoverFiles(root)).resolves.toEqual([]);
    });

    it('groups nested files by the sandbox that holds them, in name order', async () => {
        await touch(path.join(root, 'tests__b.test.ts', 'quarantine', 'z.png'));
        await touch(path.join(root, 'tests__b.test.ts', 'public', 'images', 'a.png'));
        await touch(path.join(root, 'tests__a.test.ts', 'uploads', 'x.png'));

        await expect(leftoverFiles(root)).resolves.toEqual([
            { sandbox: 'tests__a.test.ts', files: [path.join('uploads', 'x.png')] },
            {
                sandbox: 'tests__b.test.ts',
                files: [path.join('public', 'images', 'a.png'), path.join('quarantine', 'z.png')]
            }
        ]);
    });
});

describe('describeLeftovers', () => {
    it('names each offending test file by its path, then its files', () => {
        const message = describeLeftovers([
            { sandbox: 'tests__integration__uploads.test.ts', files: ['public/images/a.png'] }
        ]);

        expect(message).toContain('  tests/integration/uploads.test.ts\n    public/images/a.png');
    });
});
