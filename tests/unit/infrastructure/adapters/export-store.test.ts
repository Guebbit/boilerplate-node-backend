/**
 * The export store: a private directory of built exports, written and read as streams. What
 * matters is observable on disk: a name that is not the one shape the store writes never touches a
 * path, a build is atomic (a failed one leaves nothing), and the reaper deletes by age only.
 */

import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setEnvironment } from '@tests/environment';
import {
    openExport,
    reapExports,
    removeExport,
    writeExport
} from '@infrastructure/adapters/export-store';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'export-store-'));
    setEnvironment({ NODE_ACCOUNT_EXPORT_STORE_PATH: root });
});

afterEach(() => rm(root, { recursive: true, force: true }));

/** Stream a stored export back as text, or `undefined` when none is stored. */
const readBack = (name: string): Promise<string | undefined> =>
    openExport(name).then((stream) => (stream ? text(stream) : undefined));

describe('writeExport and openExport', () => {
    it('round-trips what was appended, in order', async () => {
        await writeExport('a.json', async (append) => {
            await append('{"a":');
            await append('1}');
        });

        await expect(readBack('a.json')).resolves.toBe('{"a":1}');
    });

    it('answers undefined for an export that was never stored', async () => {
        await expect(openExport('none.json')).resolves.toBeUndefined();
    });

    it('creates the directory on first write, so a fresh volume needs no setup', async () => {
        await rm(root, { recursive: true });

        await writeExport('a.json', (append) => append('{}'));

        await expect(readBack('a.json')).resolves.toBe('{}');
    });

    it('leaves no file at all when the build fails part-way, and rethrows why', async () => {
        const build = writeExport('a.json', async (append) => {
            await append('{"half":');
            throw new Error('a section failed');
        });

        await expect(build).rejects.toThrow('a section failed');
        expect(await readdir(root)).toEqual([]);
    });

    it('never shows a reader the file before the build has finished', async () => {
        let midBuild: string | undefined = 'untouched';

        await writeExport('a.json', async (append) => {
            await append('{"half":');
            midBuild = await readBack('a.json');
            await append('1}');
        });

        expect(midBuild).toBeUndefined();
        await expect(readBack('a.json')).resolves.toBe('{"half":1}');
    });

    // The name is never joined onto a path unless it has the one shape this store writes.
    it.each([
        '../etc/passwd',
        'a/b.json',
        'export.txt',
        '',
        'x'.repeat(90) + '.json',
        '..%2f.json'
    ])('refuses the name %j: nothing read, nothing written', async (name) => {
        await expect(openExport(name)).resolves.toBeUndefined();
        await expect(writeExport(name, (append) => append('x'))).rejects.toThrow('Not a storable');
        await expect(removeExport(name)).resolves.toBe(false);
        expect(await readdir(root)).toEqual([]);
    });
});

describe('removeExport', () => {
    it('deletes a stored export and says so', async () => {
        await writeExport('a.json', (append) => append('{}'));

        await expect(removeExport('a.json')).resolves.toBe(true);

        expect(await readdir(root)).toEqual([]);
    });

    it('treats an export that is already gone as nothing to do', async () => {
        await expect(removeExport('gone.json')).resolves.toBe(false);
    });
});

/** Backdate a stored file's modification time. */
const age = (name: string, days: number): Promise<void> => {
    const old = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return utimes(path.join(root, name), old, old);
};

describe('reapExports', () => {
    it('deletes what is past the window and keeps what is inside it, by modification time', async () => {
        await writeFile(path.join(root, 'old.json'), 'x');
        await writeFile(path.join(root, 'new.json'), 'x');
        await age('old.json', 8);
        await age('new.json', 6);

        const result = await reapExports(7 * 24 * 60 * 60 * 1000);

        expect(result).toEqual({ checked: 2, reaped: 1 });
        expect(await readdir(root)).toEqual(['new.json']);
    });

    it('is a no-op on a store that was never written', async () => {
        await rm(root, { recursive: true });

        await expect(reapExports(1000)).resolves.toEqual({ checked: 0, reaped: 0 });
    });
});
