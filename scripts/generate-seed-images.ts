#!/usr/bin/env tsx
/**
 * @module
 * Generate the demo catalogue's images — `npm run seed:images`.
 *
 * Downloads a real photo per catalogue role from Lorem Picsum, then runs it through the SAME
 * digest/thumbnail pipeline a real upload goes through (`@infrastructure/adapters/image`), so
 * `public/images/seed/` holds bytes that have been stripped/capped/recompressed exactly like
 * production output — never a hand-placed file, and never a hot-linked URL.
 *
 * One-off and network-using, deliberately NOT part of `npm run regenerate`: its output is binary
 * and worth a human glance before being committed. Re-running it is reproducible — each role's
 * Picsum `seed` path segment pins which photo comes back — but it OVERWRITES both generated
 * manifests and deletes any `public/images/seed/*.jpg` this run's role list no longer names, so a
 * retired role's old file doesn't linger unreferenced.
 *
 * `./demo.ts` and `./demo-catalog.ts` (products), and the users equivalent, read the resulting
 * `demo-images.generated.json` files — nothing there is hand-edited.
 *
 * See: IMAGE_PIPELINE_PLAN.md, docs/tools/image-processing.md
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { digestImage, thumbnailImage } from '@infrastructure/adapters/image';
import { FILLER_IMAGE_ROLE_KEYS } from '../src/modules/products/demo-catalog';

const SEED_ROOT = path.join(__dirname, '../public/images/seed');
const THUMBS_ROOT = path.join(SEED_ROOT, 'thumbs/v1');

interface ImageEntry {
    imageUrl: string;
    thumbnailUrl: string;
}

/** The five named product roles that keep an image — `barebones` deliberately has none, since
 * its whole point is exercising the schema's own `imageUrl` default. The filler roles are a
 * fixed pool (`FILLER_IMAGE_ROLE_KEYS`), independent of how large the generated catalogue grid
 * is — `./demo.ts` cycles through them, so growing the grid never needs a new download. */
const PRODUCT_ROLES = [
    'panino',
    'carinoSoftDeleted',
    'micionaOutOfStock',
    'pufettino',
    'bundleInactive',
    ...FILLER_IMAGE_ROLE_KEYS
];

const USER_ROLES = ['root', 'ginopinoshow'];

/**
 * Fetch a real photo from Lorem Picsum. The `seed` path segment pins which photo comes back, so
 * re-running this script is reproducible without hitting an actually-random endpoint twice.
 * https://picsum.photos/ — `id/seed/width/height`, no API key required.
 */
const fetchSourcePhoto = async (picsumSeed: string): Promise<Buffer> => {
    const response = await fetch(
        `https://picsum.photos/seed/${encodeURIComponent(picsumSeed)}/1600/1200`
    );
    if (!response.ok)
        throw new Error(`picsum.photos returned ${response.status} for seed "${picsumSeed}"`);
    return Buffer.from(await response.arrayBuffer());
};

/** Same naming convention a real upload gets — see `storage.ts`'s `resolveUploadFilename`: 16
 * random bytes as hex, never a name derived from anything the caller supplied. */
const randomName = (extension: string): string => `${randomBytes(16).toString('hex')}.${extension}`;

/**
 * Download, digest and thumbnail one role's image.
 *
 * The digested original lands beside the existing fixtures; the thumbnail lands in its own
 * `thumbs/v1/` subdirectory of `seed/`, not the runtime pipeline's `images/thumbs/v1/` — that
 * keeps both files inside the one directory `.gitignore` already commits
 * (`!public/images/seed/`), with no `.gitignore` edit needed.
 *
 * @param manifestKey - the role name this image is filed under in the generated manifest
 * @param picsumSeed - namespaced separately from `manifestKey` so a product and a user role
 *   that happen to share a word never fetch the same photo
 */
const generateOne = async (manifestKey: string, picsumSeed: string): Promise<ImageEntry> => {
    const source = await fetchSourcePhoto(picsumSeed);
    const digested = await digestImage(source, 'image/jpeg');
    const thumbnail = await thumbnailImage(source);

    const originalName = randomName('jpg');
    const thumbnailName = randomName('webp');

    await writeFile(path.join(SEED_ROOT, originalName), digested);
    await writeFile(path.join(THUMBS_ROOT, thumbnailName), thumbnail);

    console.info(`[seed-images] ${manifestKey} -> ${originalName} (+ thumb ${thumbnailName})`);

    return {
        imageUrl: `/images/seed/${originalName}`,
        thumbnailUrl: `/images/seed/thumbs/v1/${thumbnailName}`
    };
};

/**
 * Deletes every `.jpg` directly under `public/images/seed/` whose name isn't one this run just
 * wrote — the six hand-placed originals from before this catalogue existed, plus any orphan left
 * by a role that was since renamed or dropped. Never touches `thumbs/`, `README.md`, or anything
 * in a nested directory — those are either this script's own output or someone else's fixture.
 *
 * @param keep - basenames (not full urls) this run just wrote and must not delete
 */
const removeStaleOriginals = async (keep: ReadonlySet<string>): Promise<void> => {
    const entries = await readdir(SEED_ROOT, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jpg') || keep.has(entry.name)) continue;
        await unlink(path.join(SEED_ROOT, entry.name));
        console.info(`[seed-images] removed stale ${entry.name}`);
    }
};

const writeManifest = (relativePath: string, manifest: Record<string, ImageEntry>): Promise<void> =>
    writeFile(path.join(__dirname, '..', relativePath), `${JSON.stringify(manifest, null, 4)}\n`);

const main = async (): Promise<void> => {
    await mkdir(SEED_ROOT, { recursive: true });
    await mkdir(THUMBS_ROOT, { recursive: true });

    const products: Record<string, ImageEntry> = {};
    for (const role of PRODUCT_ROLES) products[role] = await generateOne(role, `product-${role}`);

    const users: Record<string, ImageEntry> = {};
    for (const role of USER_ROLES) users[role] = await generateOne(role, `user-${role}`);

    const keptBasenames = new Set(
        Object.values({ ...products, ...users }).map((entry) => path.basename(entry.imageUrl))
    );
    await removeStaleOriginals(keptBasenames);

    await writeManifest('src/modules/products/demo-images.generated.json', products);
    await writeManifest('src/modules/users/demo-images.generated.json', users);

    console.info(
        `[seed-images] done: ${Object.keys(products).length} product images, ` +
            `${Object.keys(users).length} user images.`
    );
};

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});
