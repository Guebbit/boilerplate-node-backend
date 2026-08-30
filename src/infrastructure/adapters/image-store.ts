/**
 * Image storage — the port every caller outside this module talks to.
 *
 * The rule that makes this worth having: **nothing outside this file may turn an `imageUrl` into a
 * filesystem path.** Spelling `deleteFile(NODE_PUBLIC_PATH + product.imageUrl)` in a service and
 * again in each write controller is what makes "move uploads to a bucket" a change to five files
 * instead of one. Here, the value persisted in `imageUrl` is an opaque handle: this module is the
 * only thing that knows
 * whether it names a file under `public/`, an object in a bucket, or something it does not own at
 * all.
 *
 * One backend exists: the local one below. The file lands under `NODE_PUBLIC_PATH/images/` and the
 * stored value is the server-relative `/images/<name>` that `express.static` answers. A second
 * backend is a second object with these methods — see the TODO above {@link imageStore}.
 *
 * See: IMAGE_PIPELINE_PLAN.md, docs/tools/image-processing.md
 */

import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { Request } from 'express';
import { deleteFile, moveFile } from '@infrastructure/adapters/filesystem';
import {
    resolveImageUrl,
    resolvePendingImageKey,
    resolveThumbnailUrl,
    toPosixPath
} from '@infrastructure/http/uploads';

export interface ImageStore {
    /**
     * Move a staged upload into quarantine — durable, but NOT under `NODE_PUBLIC_PATH`, so nothing
     * unvalidated is ever fetchable. The digest job (queued, or run inline when no broker is
     * configured) is what promotes it.
     *
     * THROWS on failure, unlike {@link remove}: the bytes not landing where the caller is about to
     * say they did is exactly the case a request must fail on.
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
     * Publish a digested original under its quarantine key, and return the value to persist in
     * `imageUrl`.
     *
     * THROWS on failure: a promote that did not land is a job worth retrying, never a job worth
     * silently dropping — see the worker's ack policy.
     *
     * @param key - the same key the original was quarantined and digested under
     * @param digested - the re-encoded bytes {@link import('./image').digestImage} produced
     * @returns the promoted image's url, legal under `ImageUrl` (`format: uri-reference`)
     */
    promote(key: string, digested: Buffer): Promise<string>;

    /**
     * Publish a thumbnail derived from the upload at `key`, and return the value to persist in
     * `thumbnailUrl`.
     *
     * Lands at its own path, `thumbs/v1/<stem>.webp` — never at the original's key — so the
     * version segment can change independently the day quality settings do. THROWS on failure,
     * for the same reason {@link promote} does.
     *
     * @param key - the same key the original was quarantined and digested under
     * @param thumbnail - the WebP bytes {@link import('./image').thumbnailImage} produced
     * @returns the promoted thumbnail's url
     */
    putDerivative(key: string, thumbnail: Buffer): Promise<string>;

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

    /**
     * Read the bytes an already-promoted `imageUrl` names.
     *
     * For one-off maintenance only (`scripts/backfill-image-thumbnails.ts`) — request-time code
     * never has a reason to re-read what it just wrote. Unlike {@link remove}'s guard, this allows
     * any file under the images root, INCLUDING subdirectories: `images/seed/`'s committed
     * fixtures are exactly what a backfill targets, and they are not this store's own writes.
     *
     * @throws When `imageUrl` is remote, or does not resolve to a real file under this store's root.
     */
    readImage(imageUrl: string): Promise<Buffer>;
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

const publicRoot = () => path.resolve(process.env.NODE_PUBLIC_PATH ?? 'public');

/**
 * Where a quarantined upload lives between the request that staged it and the job that digests it.
 *
 * Durable and OUTSIDE `NODE_PUBLIC_PATH`, unlike upload staging (`uploadStagingPath` in
 * `storage.ts`), which is ephemeral and fine to lose on a restart. A quarantined file must survive
 * one, or a pending job wakes to a vanished file and the record it names is stuck on its
 * placeholder forever. See IMAGE_PIPELINE_PLAN.md's "three directories, three lifetimes" table.
 */
const quarantineRoot = () => path.resolve(process.env.NODE_QUARANTINE_PATH ?? 'quarantine');

/** The directory holding one image's thumbnail derivatives. */
const thumbnailsDirectory = (root: string) =>
    path.join(root, IMAGES_SEGMENT, 'thumbs', THUMBNAIL_VERSION);

/** The thumbnail filename for a given original key — same stem, always `.webp`. */
const thumbnailFilename = (key: string) => `${path.basename(key, path.extname(key))}.webp`;

/**
 * Resolve a stored `imageUrl` to a real path, refusing anything that would escape `root`.
 *
 * `imageUrl` is rooted at the static mount ('/images/x.png'), so it is joined to the public
 * directory rather than resolved as an absolute path — `path.resolve(root, '/images/x')` would
 * answer '/images/x', the machine's root, since a leading slash discards everything before it.
 * The leading dot is what keeps it relative; the slash is re-added first so a stored value that
 * lost it ('images/x.png') does not become the file '.images/x.png'.
 *
 * Containment: `imageUrl` is a client-supplied string on the create/update endpoints and
 * `uri-reference` permits `/../../etc/passwd`. `path.resolve` has already collapsed the `..`
 * segments, so this compares the real destination. The public directory itself is not a stored
 * image, so equality is a rejection too.
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
 * Two forms qualify: an absolute URL with a scheme (`https://cdn.example.com/x.png`, which is what
 * `NODE_DEFAULT_IMAGE_USER` / `NODE_DEFAULT_IMAGE_PRODUCT` hold, and what a remote store will start
 * writing) and a protocol-relative one (`//cdn.example.com/x.png`). Deleting a product whose image
 * is the configured default must not resolve it against the public directory and try to unlink
 * `public/https://…` — a path that only fails to do damage because the stat happens to miss.
 *
 * `URL.canParse` is not used: it accepts `mailto:` and every other scheme, and rejects the
 * protocol-relative form, so it answers a different question than the one being asked.
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
        // Created on demand, mirroring `resolveUploadDestination` in `storage.ts`: nothing else
        // provisions this directory ahead of the first upload.
        await mkdir(root, { recursive: true });
        await moveFile(stagedPath, path.join(root, key));
        return key;
    },

    readQuarantined: (key) => readFile(path.join(quarantineRoot(), path.basename(key))),

    removeQuarantined: (key) => deleteFile(path.join(quarantineRoot(), path.basename(key))),

    promote: async (key, digested) => {
        const safeKey = path.basename(key);
        const root = publicRoot();
        await mkdir(path.join(root, IMAGES_SEGMENT), { recursive: true });
        await writeFile(path.join(root, IMAGES_SEGMENT, safeKey), digested);
        // Built from literals rather than `path.join`, because this is a URL: on Windows `join`
        // would answer `\images\x.png`, which `express.static` does not serve and which is broken
        // the moment it reaches a browser.
        return `/${IMAGES_SEGMENT}/${safeKey}`;
    },

    putDerivative: async (key, thumbnail) => {
        const root = publicRoot();
        const directory = thumbnailsDirectory(root);
        await mkdir(directory, { recursive: true });
        const filename = thumbnailFilename(key);
        await writeFile(path.join(directory, filename), thumbnail);
        return `/${IMAGES_SEGMENT}/thumbs/${THUMBNAIL_VERSION}/${filename}`;
    },

    remove: (imageUrl) => {
        if (!imageUrl || isRemoteUrl(imageUrl)) return Promise.resolve(false);

        const root = publicRoot();
        const target = resolveUnderPublicRoot(imageUrl, root);
        if (!target) return Promise.resolve(false);

        // Only files this store could have written as a MAIN image. `promote` always lands a
        // single flat name in `<public>/images/`, so anything in a SUBDIRECTORY of it belongs to
        // someone else — `images/seed/` holds the demo fixtures, which are committed repository
        // assets. Replacing a seeded record's image must not unlink one permanently, leaving every
        // later re-seed pointing at a 404, and the deletion unrecoverable outside version control.
        if (path.dirname(target) !== path.join(root, IMAGES_SEGMENT)) return Promise.resolve(false);

        // The thumbnail is deleted alongside the main image: a record only ever holds one imageUrl,
        // and this is the only call site that knows a document's image is going away. Left out,
        // every hard delete and every replaced image leaks its thumbnail forever — nothing else in
        // this store's public surface ever names a thumbnail by itself. Best-effort: it may not
        // exist (an image this old, or one whose digest job never ran), and that is not a failure.
        const thumbnailPath = path.join(thumbnailsDirectory(root), thumbnailFilename(target));

        return Promise.all([deleteFile(target), deleteFile(thumbnailPath)]).then(
            ([deleted]) => deleted
        );
    },

    readImage: (imageUrl) => {
        if (isRemoteUrl(imageUrl))
            return Promise.reject(new Error(`Not a local image: ${imageUrl}`));

        const root = publicRoot();
        const target = resolveUnderPublicRoot(imageUrl, root);
        if (!target)
            return Promise.reject(
                new Error(`Refuses to read outside the public directory: ${imageUrl}`)
            );

        return readFile(target);
    }
};

/**
 * The store the application uses.
 *
 * Uploads land on the container's own filesystem, so **rebuilding the container loses every
 * uploaded image** and two replicas do not share what they store. A mounted volume is the stopgap;
 * the durable answer is one more {@link ImageStore} implementation over an S3-compatible bucket or
 * a CDN, and nothing else.
 *
 * Nothing selects a backend yet, ON PURPOSE: a switch that offers one nobody has written is how a
 * deployment ends up half-migrated. The one trap worth knowing before starting is that `promote`
 * would begin returning ABSOLUTE urls while every existing row holds `/images/x.png` — both are
 * legal (`ImageUrl` is a `uri-reference` for exactly this reason) and both have to keep working,
 * which is what `express.static` and the local `remove` are for.
 */
export const imageStore: ImageStore = filesystemImageStore;

/** What a write controller needs from the image half of its request. */
export interface RequestImage {
    /**
     * The url to persist: this request's upload if it carried one and it was digested inline
     * (no broker configured), the pending-image placeholder if a broker will digest it later, or
     * the body's own `imageUrl` otherwise.
     */
    imageUrl: string | undefined;
    /**
     * The thumbnail url to persist alongside {@link imageUrl} — set together with it in the
     * inline case, the pending-thumbnail placeholder together with the placeholder `imageUrl`, and
     * `undefined` when nothing was uploaded (a body-supplied `imageUrl` has no thumbnail: there is
     * nothing here to derive one from).
     */
    thumbnailUrl: string | undefined;
    /**
     * The quarantine key to persist as `pendingImageKey`, so the eventual digest job's conditional
     * writeback can find this record — `undefined` whenever {@link imageUrl} is already final
     * (inline digest, or no upload at all).
     */
    pendingImageKey: string | undefined;
    /**
     * Remove whatever THIS request's upload left behind — the quarantine file if a job is still
     * pending, or the promoted image and thumbnail if it was digested inline — on a path that is
     * about to answer an error.
     *
     * Never keyed on a body-supplied {@link imageUrl}: that names an image this request did not
     * create, and deleting it because validation failed would destroy someone else's file. A
     * no-op when nothing was uploaded.
     */
    deleteUpload: () => Promise<boolean>;
}

/**
 * Read the image a write request carries, and the undo for it.
 *
 * The merge is the rule every write endpoint keeps: an uploaded file outranks a body `imageUrl`,
 * because a caller that sent bytes meant those bytes. Destructure with a default —
 * `const { imageUrl = '', deleteUpload } = readUploadedImage(request)` — where the endpoint's
 * schema wants a string rather than an absent field.
 *
 * @param request - an Express request already through the upload middleware
 */
export const readUploadedImage = (
    request: Pick<
        Request,
        'storedImageUrls' | 'storedThumbnailUrls' | 'quarantinedImageKeys' | 'body'
    >
): RequestImage => {
    const promotedUrl = resolveImageUrl(request);
    const pendingKey = resolvePendingImageKey(request);

    if (promotedUrl)
        return {
            imageUrl: promotedUrl,
            thumbnailUrl: resolveThumbnailUrl(request),
            pendingImageKey: undefined,
            deleteUpload: () => imageStore.remove(promotedUrl)
        };

    if (pendingKey)
        return {
            imageUrl: process.env.NODE_PENDING_IMAGE_URL ?? '/images/system/pending.png',
            thumbnailUrl:
                process.env.NODE_PENDING_THUMBNAIL_URL ?? '/images/system/pending-thumb.webp',
            pendingImageKey: pendingKey,
            deleteUpload: () => imageStore.removeQuarantined(pendingKey)
        };

    return {
        imageUrl: (request.body as { imageUrl?: string }).imageUrl,
        thumbnailUrl: undefined,
        pendingImageKey: undefined,
        deleteUpload: () => Promise.resolve(false)
    };
};
