#!/usr/bin/env tsx
/**
 * @module
 * Generate the demo catalogue's images: `npm run scenario:images`.
 *
 * Does:      downloads a real photo per catalogue role from Lorem Picsum and runs it through the
 *            SAME digest/thumbnail pipeline a real upload uses (`@infrastructure/adapters/image`),
 *            so `public/images/seed/` holds bytes stripped, capped and recompressed like
 *            production output: never hand-placed, never hot-linked.
 * Not run by `regenerate`: one-off and network-using, and its output is binary and worth a human
 *            glance before commit. Reproducible: each role's Picsum `seed` path segment pins its
 *            photo. It OVERWRITES both generated manifests and deletes any
 *            `public/images/seed/*.jpg` the role list no longer names.
 * Read by:   `scenarios/products.ts`, `products-filler.ts` and `users.ts`, from the resulting
 *            `*-images.generated.json` files; nothing there is hand-edited.
 *
 * @see docs/understand/image-processing.md#where-the-code-lives
 */
import '@infrastructure/config/dotenv';
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { digestImage, thumbnailImage } from '@infrastructure/adapters/image';
import { FILLER_IMAGE_ROLE_KEYS } from '@scenarios/products-filler';

/** Where the full-size seed photos land — served directly, so this is a public path. */
const SEED_ROOT = path.join(__dirname, '../../public/images/seed');

/** Thumbnails, versioned: a changed pipeline writes `v2` rather than overwriting `v1`. */
const THUMBS_ROOT = path.join(SEED_ROOT, 'thumbs/v1');

/** One role's pair of urls, as the generated manifest stores it. */
interface ImageEntry {
    /** The full-size image's public path. */
    imageUrl: string;
    /** The thumbnail's public path. */
    thumbnailUrl: string;
}

/**
 * The five named product roles that keep an image — `barebones` deliberately has none, since
 * its whole point is a product with no image field at all. The filler roles are a
 * fixed pool (`FILLER_IMAGE_ROLE_KEYS`), independent of how large the generated catalogue grid
 * is — `scenarios/products.ts` cycles through them, so growing the grid never needs a new
 * download.
 */
const PRODUCT_ROLES = [
    'dogFoodStandard',
    'heaterSoftDeleted',
    'scratchPostOutOfStock',
    'dogBedPremium',
    'bundleInactive',
    ...FILLER_IMAGE_ROLE_KEYS
];

/** The two named accounts that carry an avatar; every generated customer cycles between them. */
const USER_ROLES = ['root', 'customer'];

/**
 * Fetch a real photo from Lorem Picsum. The `seed` path segment pins which photo comes back, so
 * re-running this script is reproducible without hitting an actually-random endpoint twice.
 * https://picsum.photos/ — `id/seed/width/height`, no API key required.
 *
 * 800×600, not larger: `digestImage` never upscales, only downscales to
 * `NODE_IMAGE_MAX_DIMENSION` (2048 by default), so a bigger fetch here would just be more bytes
 * downloaded and thrown away — invisible at the catalogue-card size these are ever shown at.
 */
const fetchSourcePhoto = async (picsumSeed: string): Promise<Buffer> => {
    // Plain `fetch` (Node's global): GET a seeded 800x600 photo. The `seed` path segment pins which
    // photo comes back. https://picsum.photos/
    const response = await fetch(
        `https://picsum.photos/seed/${encodeURIComponent(picsumSeed)}/800/600`
    );
    if (!response.ok)
        throw new Error(`picsum.photos returned ${response.status} for seed "${picsumSeed}"`);
    return Buffer.from(await response.arrayBuffer());
};

/**
 * Same naming convention a real upload gets — see `http/middlewares/upload.ts`'s `resolveUploadFilename`: 16
 * random bytes as hex, never a name derived from anything the caller supplied.
 */
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
 * Deletes every file of `extension` directly in `directory` whose name isn't one this run just
 * wrote — an orphan left by a role that was since renamed or dropped. Runs over the originals and
 * the thumbnails separately, since a rename orphans one of each and leaving either behind grows
 * the committed fixture set on every rename.
 *
 * Only files directly in `directory`, and only that one extension: `README.md`, and anything in a
 * nested directory, is either someone else's fixture or a thumbnail generation this run isn't
 * writing.
 *
 * @param directory - the directory to sweep, not recursed into
 * @param extension - the file suffix this sweep owns, e.g. `.jpg`
 * @param keep - basenames (not full urls) this run just wrote and must not delete
 */
const removeStale = async (
    directory: string,
    extension: string,
    keep: ReadonlySet<string>
): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(extension) || keep.has(entry.name)) continue;
        await unlink(path.join(directory, entry.name));
        console.info(`[seed-images] removed stale ${entry.name}`);
    }
};

/** Writes one `*-images.generated.json`, four-space indented to match what Prettier expects. */
const writeManifest = (relativePath: string, manifest: Record<string, ImageEntry>): Promise<void> =>
    writeFile(
        path.join(__dirname, '..', '..', relativePath),
        `${JSON.stringify(manifest, null, 4)}\n`
    );

/**
 * Fetch and digest every role's photo, sweep whatever the role lists no longer name, write both
 * manifests.
 */
const main = async (): Promise<void> => {
    await mkdir(SEED_ROOT, { recursive: true });
    await mkdir(THUMBS_ROOT, { recursive: true });

    const products: Record<string, ImageEntry> = {};
    for (const role of PRODUCT_ROLES) products[role] = await generateOne(role, `product-${role}`);

    const users: Record<string, ImageEntry> = {};
    for (const role of USER_ROLES) users[role] = await generateOne(role, `user-${role}`);

    const written = Object.values({ ...products, ...users });
    await removeStale(SEED_ROOT, '.jpg', new Set(written.map((e) => path.basename(e.imageUrl))));
    await removeStale(
        THUMBS_ROOT,
        '.webp',
        new Set(written.map((e) => path.basename(e.thumbnailUrl)))
    );

    await writeManifest('scenarios/products-images.generated.json', products);
    await writeManifest('scenarios/users-images.generated.json', users);

    console.info(
        `[seed-images] done: ${Object.keys(products).length} product images, ` +
            `${Object.keys(users).length} user images.`
    );
};

/** Run the generator; a failure prints the stack and sets a non-zero exit code. */
main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});
