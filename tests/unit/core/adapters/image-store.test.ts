/**
 * The filesystem image store.
 *
 * This is the only module allowed to turn an `imageUrl` into a filesystem path, so it is also the
 * only place where getting that translation wrong deletes the wrong file. Real files in a real
 * temp directory: a mocked `fs` would assert that the code calls unlink with a string, which is
 * not the property that matters — *which* string is.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { filesystemImageStore } from '@core/adapters/image-store';

const ORIGINAL_PUBLIC_PATH = process.env.NODE_PUBLIC_PATH;

let root: string;

/** Creates `<root>/images/<name>` and returns both halves: the real path and the stored url. */
const makeImage = async (name: string) => {
    const file = path.join(root, 'images', name);
    await writeFile(file, 'not really a png');
    return { file, imageUrl: '/images/' + name };
};

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'image-store-test-'));
    await mkdir(path.join(root, 'images'));
    process.env.NODE_PUBLIC_PATH = root;
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    process.env.NODE_PUBLIC_PATH = ORIGINAL_PUBLIC_PATH;
});

describe('filesystemImageStore.remove', () => {
    it('deletes the file a stored url names', async () => {
        const { file, imageUrl } = await makeImage('stored.png');

        await expect(filesystemImageStore.remove(imageUrl)).resolves.toBe(true);
        expect(existsSync(file)).toBe(false);
    });

    it('reports false for a url whose file is already gone', async () => {
        await expect(filesystemImageStore.remove('/images/never-existed.png')).resolves.toBe(false);
    });

    it.each([
        ['undefined', undefined],
        ['an empty string', '']
    ])('does nothing for %s', async (_label, value) => {
        await expect(filesystemImageStore.remove(value)).resolves.toBe(false);
    });

    /**
     * `NODE_DEFAULT_IMAGE_USER` / `NODE_DEFAULT_IMAGE_PRODUCT` are absolute URLs, and every row
     * that never had an upload holds one. They belong to someone else's server, and once an
     * S3-backed store exists they will be the normal shape of a stored value too.
     */
    it.each([
        'https://cdn.example.com/x.png',
        'http://cdn.example.com/x.png',
        '//cdn.example.com/x.png'
    ])('does not treat %s as a local file', async (imageUrl) => {
        const { file } = await makeImage('untouched.png');

        await expect(filesystemImageStore.remove(imageUrl)).resolves.toBe(false);
        expect(existsSync(file)).toBe(true);
    });

    /**
     * The reason containment lives here: `imageUrl` is client-supplied on create/update, the
     * contract declares it `uri-reference` (which permits this), and the code this replaced fed
     * `publicPath + imageUrl` straight to unlink. An admin could delete any file the process could
     * reach by hard-deleting a product whose image url pointed at it.
     */
    it.each([
        '/../outside.png',
        '/images/../../outside.png',
        '/images/subdir/../../../outside.png'
    ])('refuses to escape the public directory via %s', async (imageUrl) => {
        const outside = path.join(root, '..', 'outside.png');
        await writeFile(outside, 'someone else');

        try {
            await expect(filesystemImageStore.remove(imageUrl)).resolves.toBe(false);
            expect(existsSync(outside)).toBe(true);
        } finally {
            await rm(outside, { force: true });
        }
    });

    it('refuses to delete the public directory itself', async () => {
        await expect(filesystemImageStore.remove('/')).resolves.toBe(false);
        expect(existsSync(root)).toBe(true);
    });

    /* Defensive: nothing writes this shape today, but a stored value without its leading slash
       must resolve to `<root>/images/x.png`, not to a hidden file named `.images`. */
    it('accepts a stored url that lost its leading slash', async () => {
        const { file } = await makeImage('slashless.png');

        await expect(filesystemImageStore.remove('images/slashless.png')).resolves.toBe(true);
        expect(existsSync(file)).toBe(false);
    });

    /* multer builds paths with `path.join`, so a Windows-shaped value can reach the database. */
    it('accepts a windows-shaped stored url', async () => {
        const { file } = await makeImage('windows.png');

        await expect(filesystemImageStore.remove(String.raw`\images\windows.png`)).resolves.toBe(
            true
        );
        expect(existsSync(file)).toBe(false);
    });

    it('resolves the public directory at call time, not at import time', async () => {
        const { file, imageUrl } = await makeImage('relocated.png');
        process.env.NODE_PUBLIC_PATH = path.join(root, 'elsewhere');

        await expect(filesystemImageStore.remove(imageUrl)).resolves.toBe(false);
        expect(existsSync(file)).toBe(true);

        process.env.NODE_PUBLIC_PATH = root;
        await expect(filesystemImageStore.remove(imageUrl)).resolves.toBe(true);
    });
});
