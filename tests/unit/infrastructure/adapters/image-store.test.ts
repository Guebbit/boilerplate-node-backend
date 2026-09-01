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
import { filesystemImageStore } from '@infrastructure/adapters/image-store';

const ORIGINAL_PUBLIC_PATH = process.env.NODE_PUBLIC_PATH;
const ORIGINAL_QUARANTINE_PATH = process.env.NODE_QUARANTINE_PATH;

let root: string;

/** Creates `<root>/images/<name>` and returns both halves: the real path and the stored url. */
const makeImage = async (name: string) => {
    const file = path.join(root, 'images', name);
    await writeFile(file, 'not really a png');
    return { file, imageUrl: '/images/' + name };
};

/** Creates the thumbnail derivative that `remove()` should clean up alongside a given main image. */
const makeThumbnail = async (stem: string) => {
    const directory = path.join(root, 'images', 'thumbs', 'v1');
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${stem}.webp`);
    await writeFile(file, 'not really a webp');
    return file;
};

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'image-store-test-'));
    await mkdir(path.join(root, 'images'));
    process.env.NODE_PUBLIC_PATH = root;
    process.env.NODE_QUARANTINE_PATH = path.join(root, 'quarantine');
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    process.env.NODE_PUBLIC_PATH = ORIGINAL_PUBLIC_PATH;
    process.env.NODE_QUARANTINE_PATH = ORIGINAL_QUARANTINE_PATH;
});

/** A file standing in for a staged upload, in its own directory outside the public root. */
const stageUpload = async (name: string, contents = 'image bytes') => {
    const staging = path.join(root, 'staging');
    await mkdir(staging, { recursive: true });
    const file = path.join(staging, name);
    await writeFile(file, contents);
    return file;
};

describe('filesystemImageStore.quarantine', () => {
    it('moves the staged file into the quarantine directory and returns its key', async () => {
        const staged = await stageUpload('abc123.png', 'the uploaded bytes');

        const key = await filesystemImageStore.quarantine(staged);

        expect(key).toBe('abc123.png');
        expect(await readFile(path.join(root, 'quarantine', 'abc123.png'), 'utf8')).toBe(
            'the uploaded bytes'
        );
    });

    /* Staging exists so an unvalidated upload is never publicly readable; leaving a copy behind
       would defeat it, and would leak a file per upload besides. */
    it('consumes the staged file', async () => {
        const staged = await stageUpload('abc123.png');

        await filesystemImageStore.quarantine(staged);

        expect(existsSync(staged)).toBe(false);
    });

    /* Nothing else provisions this directory ahead of the first upload — same as
       `resolveUploadDestination` does for the staging path in `storage.ts`. */
    it('creates the quarantine directory on demand', async () => {
        const staged = await stageUpload('abc123.png');
        expect(existsSync(path.join(root, 'quarantine'))).toBe(false);

        await filesystemImageStore.quarantine(staged);

        expect(existsSync(path.join(root, 'quarantine', 'abc123.png'))).toBe(true);
    });
});

describe('filesystemImageStore.readQuarantined', () => {
    it('reads back the bytes quarantine() moved', async () => {
        const staged = await stageUpload('abc123.png', 'the uploaded bytes');
        const key = await filesystemImageStore.quarantine(staged);

        await expect(filesystemImageStore.readQuarantined(key)).resolves.toEqual(
            Buffer.from('the uploaded bytes')
        );
    });

    it('rejects when nothing is quarantined under that key', async () => {
        await expect(filesystemImageStore.readQuarantined('never-existed.png')).rejects.toThrow();
    });
});

describe('filesystemImageStore.removeQuarantined', () => {
    it('deletes the quarantined file', async () => {
        const staged = await stageUpload('abc123.png');
        const key = await filesystemImageStore.quarantine(staged);

        await expect(filesystemImageStore.removeQuarantined(key)).resolves.toBe(true);
        expect(existsSync(path.join(root, 'quarantine', 'abc123.png'))).toBe(false);
    });

    it('reports false for a key that is not quarantined', async () => {
        await expect(filesystemImageStore.removeQuarantined('never-existed.png')).resolves.toBe(
            false
        );
    });
});

describe('filesystemImageStore.promote', () => {
    it('writes the digested bytes under the public images directory, keyed by the same name', async () => {
        const url = await filesystemImageStore.promote('abc123.png', Buffer.from('digested bytes'));

        expect(url).toBe('/images/abc123.png');
        expect(await readFile(path.join(root, 'images', 'abc123.png'), 'utf8')).toBe(
            'digested bytes'
        );
    });

    it('returns a url, never a path', async () => {
        const url = await filesystemImageStore.promote('abc123.png', Buffer.from('x'));

        expect(url).not.toMatch(/\\/);
        expect(url.startsWith('/')).toBe(true);
    });

    it('creates the images directory on demand', async () => {
        await rm(path.join(root, 'images'), { recursive: true, force: true });

        await filesystemImageStore.promote('abc123.png', Buffer.from('x'));

        expect(existsSync(path.join(root, 'images', 'abc123.png'))).toBe(true);
    });
});

describe('filesystemImageStore.putDerivative', () => {
    it('writes the thumbnail under images/thumbs/v1/<stem>.webp, always as .webp', async () => {
        const url = await filesystemImageStore.putDerivative(
            'abc123.jpg',
            Buffer.from('thumbnail bytes')
        );

        expect(url).toBe('/images/thumbs/v1/abc123.webp');
        expect(
            await readFile(path.join(root, 'images', 'thumbs', 'v1', 'abc123.webp'), 'utf8')
        ).toBe('thumbnail bytes');
    });

    it('creates the thumbnails directory on demand', async () => {
        await filesystemImageStore.putDerivative('abc123.png', Buffer.from('x'));

        expect(existsSync(path.join(root, 'images', 'thumbs', 'v1', 'abc123.webp'))).toBe(true);
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

    /**
     * `remove()` is the only call site that knows a document's image is going away, so it is the
     * one place responsible for its thumbnail too — otherwise every hard delete and every replaced
     * image leaks its `thumbs/v1/` derivative forever.
     */
    it('also deletes the thumbnail that shares the image key’s stem', async () => {
        const { file, imageUrl } = await makeImage('stored.jpg');
        const thumbnail = await makeThumbnail('stored');

        await expect(filesystemImageStore.remove(imageUrl)).resolves.toBe(true);

        expect(existsSync(file)).toBe(false);
        expect(existsSync(thumbnail)).toBe(false);
    });

    /* Most images predate the digest pipeline, or never went through a broker fast enough to grow
       one — a missing thumbnail must not stop the main image from being deleted. */
    it('still deletes the main image when it has no thumbnail', async () => {
        const { file, imageUrl } = await makeImage('stored.png');

        await expect(filesystemImageStore.remove(imageUrl)).resolves.toBe(true);
        expect(existsSync(file)).toBe(false);
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
     * `promote` lands a flat name in `<public>/images/`, so a subdirectory of it holds files this
     * store did not write as a main image. `images/seed/` is the demo fixtures, committed to the
     * repository: replacing a seeded record's image must not unlink one, or every later re-seed
     * points at a 404 and the asset is gone outside version control.
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

    /**
     * The `?? 'public'` fallback, exercised with the variable genuinely absent.
     *
     * Every other case here SETS `NODE_PUBLIC_PATH` — reasonably, since deployments do — which left
     * the default itself untested: nothing here distinguished `'public'` from any other string, or
     * from none. It showed up as a mutation-score flip that depended on cross-test environment
     * state rather than on the code.
     *
     * `process.chdir` rather than writing into the repository's own `public/`: the fallback is
     * relative, so it resolves against the working directory, and moving that is what lets a real
     * file stand in for a real deployment without touching a committed directory.
     */
    it('falls back to ./public relative to the working directory', async () => {
        const originalCwd = process.cwd();
        const publicImages = path.join(root, 'public', 'images');
        await mkdir(publicImages, { recursive: true });
        const file = path.join(publicImages, 'default-root.png');
        await writeFile(file, 'not really a png');

        try {
            delete process.env.NODE_PUBLIC_PATH;
            process.chdir(root);

            await expect(filesystemImageStore.remove('/images/default-root.png')).resolves.toBe(
                true
            );
            expect(existsSync(file)).toBe(false);
        } finally {
            process.chdir(originalCwd);
        }
    });
});
