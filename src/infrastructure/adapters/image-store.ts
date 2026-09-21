/**
 * @module
 * Image storage — the port every caller outside this module talks to. Nothing outside this file
 * may turn an `imageUrl` into a filesystem path: spelling that construction in a service and
 * again in each write controller is what makes "move uploads to a bucket" a change to five files
 * instead of one. `imageUrl` is an opaque handle — only this module knows whether it names a file
 * under `public/`, a bucket object, or something it does not own at all. One backend exists
 * today: local, under `NODE_PUBLIC_PATH/images/`.
 *
 * See: docs/tools/image-processing.md
 */

import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deleteFile, moveFile, toPosixPath } from '@infrastructure/adapters/filesystem';
import type { ReencodableImageMime } from '@infrastructure/adapters/image';

/**
 * The seam between an upload and wherever bytes actually live. One implementation ships today —
 * local, under `NODE_PUBLIC_PATH/images/` — and `imageUrl` stays an opaque handle so a second one
 * needs no caller to change.
 */
export interface ImageStore {
    /**
     * Move a staged upload into quarantine — durable, but NOT under `NODE_PUBLIC_PATH`, so nothing
     * unvalidated is fetchable. The digest job promotes it later. THROWS on failure, unlike
     * {@link remove}: bytes not landing where the caller is about to say they did is exactly the
     * case a request must fail on.
     *
     * @param stagedPath - the private path multer wrote the upload to
     * @returns the opaque key this upload is addressed by from here on — never a filesystem path
     */
    quarantine(stagedPath: string): Promise<string>;

    /**
     * Read a quarantined upload's raw bytes, for the digest step to decode.
     *
     * @param key - a value {@link quarantine} returned
     * @throws When nothing is quarantined under `key` (already processed by another delivery of
     *   the same job, or reaped) or the read otherwise fails.
     */
    readQuarantined(key: string): Promise<Buffer>;

    /**
     * Delete a quarantined upload without promoting it.
     *
     * Never rejects, matching {@link remove}: called on failure paths (a bad decode, a request
     * that fails validation before the job runs) that must not gain a second, different failure.
     *
     * @param key - a value {@link quarantine} returned
     * @returns whether something was actually deleted
     */
    removeQuarantined(key: string): Promise<boolean>;

    /**
     * Publish a digested original under a name DERIVED FROM ITS OWN BYTES, and return the value to
     * persist in `imageUrl` — never named from the upload's quarantine key. Two digest runs of the
     * SAME input converge on the identical file (a harmless duplicate write of identical bytes);
     * two runs of DIFFERENT input can never collide, which is what makes a stale run's cleanup safe
     * to run at all — it can never delete a newer run's live file, because their names differ the
     * moment their content does. Doubles as cache-busting: the URL only changes when the content
     * does.
     *
     * THROWS on failure: a promote that did not land is a job worth retrying, never a job worth
     * silently dropping — see the worker's ack policy.
     *
     * @param stem - the shared identity this original and {@link putDerivative}'s thumbnail are
     *   filed under — `image.worker.ts` derives it once, from the digested bytes, and passes it to
     *   both, so `remove` can still find a main image's thumbnail from its own filename alone
     * @param digested - the re-encoded bytes {@link import('./image').digestImage} produced
     * @param mime - which of the three accepted formats `digested` was encoded as, for the extension
     * @returns the promoted image's url, legal under `ImageUrl` (`format: uri-reference`)
     */
    promote(stem: string, digested: Buffer, mime: ReencodableImageMime): Promise<string>;

    /**
     * Publish a thumbnail under the SAME `stem` {@link promote} used for the original — never the
     * thumbnail's own bytes' hash, so `remove` can derive a thumbnail's filename from the main
     * image's filename alone, without needing the thumbnail's bytes on hand. Lands at its own path,
     * `thumbs/v1/<stem>.webp` — never at the original's own path — so the version segment can
     * change independently the day quality settings do. THROWS on failure, same reason
     * {@link promote} does.
     *
     * @param stem - the same value passed to {@link promote} for this digest run
     * @param thumbnail - the WebP bytes {@link import('./image').thumbnailImage} produced
     * @returns the promoted thumbnail's url
     */
    putDerivative(stem: string, thumbnail: Buffer): Promise<string>;

    /**
     * Delete the stored image (and its thumbnail, if one exists) an `imageUrl` names.
     *
     * Never rejects, and never throws: cleanup runs on failure paths that are already answering an
     * error to the client, and a failed unlink must not become a second, different failure.
     *
     * @param imageUrl - the value as persisted on the document. Anything this store does not own —
     *   an absolute url, a path outside its root, nothing at all — is a no-op.
     * @returns whether the main image was actually deleted
     */
    remove(imageUrl: string | undefined): Promise<boolean>;
}

/**
 * The directory (local) / key prefix (remote) uploads live under, and the URL segment they are
 * served from. One constant because the three have to agree: `express.static` serves
 * `NODE_PUBLIC_PATH` at the site root, so the folder name *is* the url segment.
 */
const IMAGES_SEGMENT = 'images';

/** Version segment for thumbnails — bump it, rather than overwriting existing files in place, the
 * day quality settings change: every url is `immutable, 1y` and cannot be revalidated. */
const THUMBNAIL_VERSION = 'v1';

/** The directory `express.static` serves at the site root — where a promoted image finally lands. */
const publicRoot = () => path.resolve(process.env.NODE_PUBLIC_PATH ?? 'public');

/**
 * Where a quarantined upload lives between the request that staged it and the job that digests it.
 *
 * Durable and OUTSIDE `NODE_PUBLIC_PATH`, unlike ephemeral upload staging (`uploadStagingPath` in
 * `http/middlewares/upload.ts`) — a quarantined file must survive a restart, or a pending job wakes to a vanished
 * file and the record it names is stuck on its placeholder forever. The `tmp/quarantine` default
 * is a local-dev convenience only: a real deployment always sets `NODE_QUARANTINE_PATH` to its own
 * mounted volume, so the durability guarantee comes from that mount, never from this default.
 */
const quarantineRoot = () =>
    path.resolve(process.env.NODE_QUARANTINE_PATH ?? path.join('tmp', 'quarantine'));

/** The directory holding one image's thumbnail derivatives. */
const thumbnailsDirectory = (root: string) =>
    path.join(root, IMAGES_SEGMENT, 'thumbs', THUMBNAIL_VERSION);

/** The thumbnail filename for a given original's stem — same stem, always `.webp`. */
const thumbnailFilename = (key: string) => `${path.basename(key, path.extname(key))}.webp`;

/** The file extension `promote` writes for each accepted format — the standard short spelling. */
const EXTENSION_OF: Record<ReencodableImageMime, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp'
};

/**
 * Resolve a stored `imageUrl` to a real path, refusing anything that would escape `root`.
 *
 * `imageUrl` is rooted at the static mount ('/images/x.png'), so it's joined to the public
 * directory rather than resolved as absolute — `path.resolve(root, '/images/x')` would answer
 * '/images/x', the machine's root, since a leading slash discards everything before it.
 *
 * Security-relevant: `imageUrl` is client-supplied on the create/update endpoints and
 * `uri-reference` permits `/../../etc/passwd`. `path.resolve` has already collapsed `..`
 * segments, so this compares the real destination — and the public directory itself is not a
 * stored image, so equality is rejected too.
 *
 * @returns the resolved path, or `undefined` when it would land outside `root`
 */
const resolveUnderPublicRoot = (imageUrl: string, root: string): string | undefined => {
    const relative = toPosixPath(imageUrl);
    const target = path.resolve(root, '.' + (relative.startsWith('/') ? relative : '/' + relative));
    return target.startsWith(root + path.sep) ? target : undefined;
};

/**
 * Whether a value looks like a URL pointing somewhere else entirely.
 *
 * Two forms qualify: an absolute URL with a scheme (`https://cdn.example.com/x.png` — what the
 * default-image env vars hold) and a protocol-relative one (`//cdn.example.com/x.png`). Matters
 * because deleting a record whose image is the configured default must not try to unlink
 * `public/https://…`. `URL.canParse` isn't used: it accepts `mailto:` and rejects the
 * protocol-relative form, so it answers a different question.
 */
const isRemoteUrl = (value: string) =>
    /^[a-z][\d+.a-z-]*:\/\//i.test(value) || value.startsWith('//');

/**
 * The store this API has always had: files under `NODE_PUBLIC_PATH/images/`, served by
 * `express.static`, addressed by the server-relative path `/images/<name>`.
 */
export const filesystemImageStore: ImageStore = {
    quarantine: async (stagedPath) => {
        const key = path.basename(stagedPath);
        const root = quarantineRoot();
        // Created on demand, mirroring `resolveUploadDestination` in `http/middlewares/upload.ts`: nothing else
        // provisions this directory ahead of the first upload.
        await mkdir(root, { recursive: true });
        await moveFile(stagedPath, path.join(root, key));
        return key;
    },

    readQuarantined: (key) => readFile(path.join(quarantineRoot(), path.basename(key))),

    removeQuarantined: (key) => deleteFile(path.join(quarantineRoot(), path.basename(key))),

    promote: async (stem, digested, mime) => {
        const safeStem = path.basename(stem);
        const filename = `${safeStem}${EXTENSION_OF[mime]}`;
        const root = publicRoot();
        await mkdir(path.join(root, IMAGES_SEGMENT), { recursive: true });
        await writeFile(path.join(root, IMAGES_SEGMENT, filename), digested);
        // Built from literals rather than `path.join`, because this is a URL: on Windows `join`
        // would answer `\images\x.png`, which `express.static` does not serve and which is broken
        // the moment it reaches a browser.
        return `/${IMAGES_SEGMENT}/${filename}`;
    },

    putDerivative: async (stem, thumbnail) => {
        const root = publicRoot();
        const directory = thumbnailsDirectory(root);
        await mkdir(directory, { recursive: true });
        const filename = thumbnailFilename(stem);
        await writeFile(path.join(directory, filename), thumbnail);
        return `/${IMAGES_SEGMENT}/thumbs/${THUMBNAIL_VERSION}/${filename}`;
    },

    remove: (imageUrl) => {
        if (!imageUrl || isRemoteUrl(imageUrl)) return Promise.resolve(false);

        const root = publicRoot();
        const target = resolveUnderPublicRoot(imageUrl, root);
        if (!target) return Promise.resolve(false);

        // Only files this store could have written as a MAIN image. `promote` always lands a flat
        // name in `<public>/images/` — anything in a subdirectory belongs to someone else, like
        // `images/seed/`'s committed demo fixtures. Replacing a seeded record's image must not
        // permanently unlink one, leaving every re-seed pointing at a 404.
        if (path.dirname(target) !== path.join(root, IMAGES_SEGMENT)) return Promise.resolve(false);

        // The thumbnail is deleted alongside the main image: this is the only call site that knows
        // a document's image is going away. Left out, every hard delete and replaced image leaks
        // its thumbnail forever. Best-effort — it may not exist (older image, or a digest job that
        // never ran) and that's not a failure.
        const thumbnailPath = path.join(thumbnailsDirectory(root), thumbnailFilename(target));

        return Promise.all([deleteFile(target), deleteFile(thumbnailPath)]).then(
            ([deleted]) => deleted
        );
    }
};

/**
 * The store the application uses.
 *
 * Uploads land on the container's own filesystem, so **rebuilding the container loses every
 * uploaded image**, and replicas don't share what they store. A mounted volume is the stopgap;
 * the durable answer is another {@link ImageStore} over an S3-compatible bucket or a CDN.
 *
 * Nothing selects a backend yet, ON PURPOSE — a switch offering one nobody wrote invites a
 * half-migrated deployment. Watch for `promote` starting to return ABSOLUTE urls while existing
 * rows hold `/images/x.png`: both are legal (`ImageUrl` is a `uri-reference`) and both must keep
 * working.
 */
export const imageStore: ImageStore = filesystemImageStore;
