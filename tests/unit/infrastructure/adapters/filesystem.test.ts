/**
 * `moveFile` — the one filesystem operation an upload cannot survive getting wrong.
 *
 * It exists because `rename` cannot cross a device boundary, and this application crosses one by
 * default: uploads are staged in the system temp directory (frequently a tmpfs) and committed into
 * the public directory (a disk, or a mounted volume). So the EXDEV fallback is not a defensive
 * branch for an exotic host — on a normal Linux deployment it is the only branch that ever runs.
 */
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let root: string;

const stage = async (name: string, contents = 'image bytes') => {
    const file = path.join(root, name);
    await writeFile(file, contents);
    return file;
};

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'move-file-test-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    jest.resetModules();
});

describe('moveFile', () => {
    it('moves the file, contents intact, leaving nothing behind', async () => {
        const { moveFile } = await import('@infrastructure/adapters/filesystem');
        const source = await stage('staged.png', 'the original bytes');
        const destination = path.join(root, 'committed.png');

        await moveFile(source, destination);

        expect(existsSync(source)).toBe(false);
        expect(await readFile(destination, 'utf8')).toBe('the original bytes');
    });

    it('overwrites an existing destination rather than failing', async () => {
        const { moveFile } = await import('@infrastructure/adapters/filesystem');
        const source = await stage('staged.png', 'new');
        const destination = await stage('committed.png', 'old');

        await moveFile(source, destination);

        expect(await readFile(destination, 'utf8')).toBe('new');
    });

    it('throws when the destination directory does not exist', async () => {
        const { moveFile } = await import('@infrastructure/adapters/filesystem');
        const source = await stage('staged.png');

        // Throwing is the contract: a silent failure here means the database is about to record a
        // url for bytes that are not there.
        await expect(
            moveFile(source, path.join(root, 'no-such-directory', 'committed.png'))
        ).rejects.toThrow();
    });

    /**
     * The cross-device case, forced rather than hoped for: whether the host's temp directory and
     * the repository share a filesystem is a property of the machine the suite happens to run on,
     * and this branch is too important to test only where the answer is "no".
     */
    describe('when the two paths are on different filesystems', () => {
        it('falls back to copy-then-unlink', async () => {
            jest.doMock('node:fs/promises', () => {
                const actual =
                    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
                return {
                    ...actual,
                    rename: jest.fn().mockRejectedValue(
                        Object.assign(new Error('EXDEV: cross-device link not permitted'), {
                            code: 'EXDEV'
                        })
                    )
                };
            });

            const { moveFile } = await import('@infrastructure/adapters/filesystem');
            const source = await stage('staged.png', 'the original bytes');
            const destination = path.join(root, 'committed.png');

            await moveFile(source, destination);

            // Identical outcome to the fast path — that is the whole requirement.
            expect(existsSync(source)).toBe(false);
            expect(await readFile(destination, 'utf8')).toBe('the original bytes');
        });

        it('still throws on a failure that is not a device boundary', async () => {
            jest.doMock('node:fs/promises', () => {
                const actual =
                    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
                return {
                    ...actual,
                    rename: jest.fn().mockRejectedValue(
                        Object.assign(new Error('EACCES: permission denied'), {
                            code: 'EACCES'
                        })
                    )
                };
            });

            const { moveFile } = await import('@infrastructure/adapters/filesystem');
            const source = await stage('staged.png');

            // A permissions problem must surface, not be retried as a copy that fails differently.
            await expect(moveFile(source, path.join(root, 'committed.png'))).rejects.toThrow(
                'EACCES'
            );
        });
    });
});

describe('toPosixPath', () => {
    it('rewrites every separator, not just the first', async () => {
        const { toPosixPath } = await import('@infrastructure/adapters/filesystem');
        expect(toPosixPath(String.raw`a\b\c\d.png`)).toBe('a/b/c/d.png');
    });

    it('leaves an already-posix path untouched', async () => {
        // Idempotence matters: the helper runs on values that may already have been through it.
        const { toPosixPath } = await import('@infrastructure/adapters/filesystem');
        expect(toPosixPath('/images/a.png')).toBe('/images/a.png');
    });

    it('leaves a path with no separators at all untouched', async () => {
        const { toPosixPath } = await import('@infrastructure/adapters/filesystem');
        expect(toPosixPath('a.png')).toBe('a.png');
    });
});

describe('reapDirectory', () => {
    it('deletes only files at or before the cutoff, and counts every entry checked', async () => {
        const { reapDirectory } = await import('@infrastructure/adapters/filesystem');
        const old = await stage('old.pdf');
        const recent = await stage('recent.pdf');
        const cutoff = Date.now();
        await utimes(old, new Date(cutoff - 1000), new Date(cutoff - 1000));
        await utimes(recent, new Date(cutoff + 60_000), new Date(cutoff + 60_000));

        const result = await reapDirectory(root, cutoff, 'Test');

        expect(result).toEqual({ checked: 2, reaped: 1 });
        expect(existsSync(old)).toBe(false);
        expect(existsSync(recent)).toBe(true);
    });

    it('leaves a subdirectory alone', async () => {
        const { reapDirectory } = await import('@infrastructure/adapters/filesystem');
        const nested = path.join(root, 'nested');
        await mkdir(nested);
        await utimes(nested, new Date(0), new Date(0));

        const result = await reapDirectory(root, Date.now(), 'Test');

        expect(result).toEqual({ checked: 1, reaped: 0 });
        expect(existsSync(nested)).toBe(true);
    });

    it('skips an entry that is gone by the time it is checked, instead of failing the sweep', async () => {
        const { reapDirectory } = await import('@infrastructure/adapters/filesystem');
        // A dangling link: listed by `readdir`, ENOENT to `stat` — the same answer a file
        // deleted mid-sweep gives.
        await symlink(path.join(root, 'already-gone'), path.join(root, 'dangling'));

        await expect(reapDirectory(root, Date.now(), 'Test')).resolves.toEqual({
            checked: 1,
            reaped: 0
        });
        await unlink(path.join(root, 'dangling'));
    });

    it('reports zero, rather than throwing, for a directory that does not exist', async () => {
        const { reapDirectory } = await import('@infrastructure/adapters/filesystem');

        await expect(
            reapDirectory(path.join(root, 'never-created'), Date.now(), 'Test')
        ).resolves.toEqual({ checked: 0, reaped: 0 });
    });
});
