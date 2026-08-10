/**
 * The filesystem image store.
 *
 * This is the only module allowed to turn an `imageUrl` into a filesystem path, so it is also the
 * only place where getting that translation wrong deletes the wrong file. Real files in a real
 * temp directory: a mocked `fs` would assert that the code calls unlink with a string, which is
 * not the property that matters — *which* string is.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { filesystemImageStore, imageStore } from '@core/adapters/image-store';

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

/** A file standing in for a staged upload, in its own directory outside the public root. */
const stageUpload = async (name: string, contents = 'image bytes') => {
    const staging = path.join(root, 'staging');
    await mkdir(staging, { recursive: true });
    const file = path.join(staging, name);
    await writeFile(file, contents);
    return file;
};

describe('filesystemImageStore.put', () => {
    it('commits the staged file into the public images directory', async () => {
        const staged = await stageUpload('abc123.png', 'the uploaded bytes');

        const url = await filesystemImageStore.put(staged);

        expect(url).toBe('/images/abc123.png');
        expect(await readFile(path.join(root, 'images', 'abc123.png'), 'utf8')).toBe(
            'the uploaded bytes'
        );
    });

    /* Staging exists so an unchecked upload is never publicly readable; leaving a copy behind
       would defeat it, and would leak a file per upload besides. */
    it('consumes the staged file', async () => {
        const staged = await stageUpload('abc123.png');

        await filesystemImageStore.put(staged);

        expect(existsSync(staged)).toBe(false);
    });

    /**
     * The url is built from literals, not from the destination path, so a Windows separator cannot
     * reach a stored value however the filesystem spells it.
     */
    it('returns a url, never a path', async () => {
        const staged = await stageUpload('abc123.png');

        const url = await filesystemImageStore.put(staged);

        expect(url).not.toMatch(/\\/);
        expect(url.startsWith('/')).toBe(true);
    });

    it('round-trips: what put returns, remove deletes', async () => {
        const staged = await stageUpload('abc123.png');

        const url = await filesystemImageStore.put(staged);

        await expect(filesystemImageStore.remove(url)).resolves.toBe(true);
        expect(existsSync(path.join(root, 'images', 'abc123.png'))).toBe(false);
    });

    /* Unlike `remove`, this one must fail loudly: the caller is about to persist the url. */
    it('rejects when the images directory does not exist', async () => {
        await rm(path.join(root, 'images'), { recursive: true, force: true });
        const staged = await stageUpload('abc123.png');

        await expect(filesystemImageStore.put(staged)).rejects.toThrow();
    });
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

    /**
     * The case that separates "rejected because it is remote" from "rejected by a later guard".
     *
     * Every other remote url in this file (`https://cdn.example.com/x.png`) would also be refused
     * with `isRemoteUrl` removed entirely, because read as a local path it lands in a
     * subdirectory and the images-directory check catches it. So none of them actually pins the
     * remote check — they pass either way.
     *
     * This one does: `//images/flat.png` is protocol-relative (host `images`), but read as a
     * local path it is exactly `<public>/images/flat.png`, a flat file this store could have
     * written. If the protocol-relative half of `isRemoteUrl` stops working, someone else's file
     * is deleted.
     */
    it('does not delete a local-looking file named by a protocol-relative url', async () => {
        const { file } = await makeImage('flat.png');

        await expect(filesystemImageStore.remove('//images/flat.png')).resolves.toBe(false);
        expect(existsSync(file)).toBe(true);
    });

    it('refuses to delete the public directory itself', async () => {
        await expect(filesystemImageStore.remove('/')).resolves.toBe(false);
        expect(existsSync(root)).toBe(true);
    });

    /*
     * `put` lands a flat name in `<public>/images/`, so a subdirectory of it holds files this
     * store did not write. `images/seed/` is the demo fixtures, committed to the repository:
     * replacing a seeded record's image must not unlink one, or every later re-seed points at a
     * 404 and the asset is gone outside version control.
     */
    it('refuses to delete a file in a subdirectory of the images directory', async () => {
        const seedDirectory = path.join(root, 'images', 'seed');
        await mkdir(seedDirectory, { recursive: true });
        const fixture = path.join(seedDirectory, 'fixture.jpg');
        await writeFile(fixture, 'committed asset');

        await expect(filesystemImageStore.remove('/images/seed/fixture.jpg')).resolves.toBe(false);
        expect(existsSync(fixture)).toBe(true);
    });

    it('still deletes a file directly in the images directory', async () => {
        const { file, imageUrl } = await makeImage('flat.png');

        await expect(filesystemImageStore.remove(imageUrl)).resolves.toBe(true);
        expect(existsSync(file)).toBe(false);
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
